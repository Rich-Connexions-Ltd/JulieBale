#!/usr/bin/env python3
"""Council of Experts review system for pair programming workflow.

Submits plans/code to focused expert reviewers using multiple platforms:
  - Codex CLI (account auth, no API key needed) — primary for most roles
  - Google Gemini (API key) — primary for performance/cost/UX roles
  - Anthropic Claude (API key) — consolidator and fallback

Council composition, models, and phase assignments are configured in
council-config.json.

Usage:
    ./scripts/council-review.py plan <sprint> "<title>"
    ./scripts/council-review.py code <sprint> "<title>"

Requires environment variables (depending on council-config.json):
    GOOGLE_API_KEY      — Gemini models
    ANTHROPIC_API_KEY   — Claude models
    (Codex members authenticate via stored credentials — run 'codex login' once)
"""

import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

QUORUM_THRESHOLD = 3  # Minimum successful council reviews needed

# ---------------------------------------------------------------------------
# Secret Redaction
# ---------------------------------------------------------------------------

_SECRET_PATTERNS = [
    re.compile(r"sk-[A-Za-z0-9\-_]{20,}", re.IGNORECASE),
    re.compile(r"sk-ant-[A-Za-z0-9\-_]{20,}", re.IGNORECASE),
    re.compile(r"AIza[0-9A-Za-z\-_]{35}"),
    re.compile(r"xox[bprs]-[A-Za-z0-9\-_]{10,}"),
    re.compile(
        r"(api[_-]?key|api[_-]?token|auth[_-]?token|access[_-]?token|secret|password|private[_-]?key)"
        r"\s*[=:]\s*['\"]?[A-Za-z0-9\-_\.+/=]{8,}['\"]?",
        re.IGNORECASE,
    ),
    re.compile(r"Bearer\s+[A-Za-z0-9\-_\.+/=]{8,}", re.IGNORECASE),
]


def redact_secrets(text: str) -> str:
    """Redact common secret patterns from text before sending to external APIs."""
    for pattern in _SECRET_PATTERNS:
        text = pattern.sub("[REDACTED]", text)
    return text


# ---------------------------------------------------------------------------
# Environment — source API keys from ~/.zprofile if not already in env
# ---------------------------------------------------------------------------


def ensure_api_keys_from_profile():
    """Source API keys from ~/.zprofile if they're missing from the environment."""
    zprofile = Path.home() / ".zprofile"
    if not zprofile.exists():
        return

    needed = {"GOOGLE_API_KEY", "ANTHROPIC_API_KEY"}
    missing = {k for k in needed if not os.environ.get(k)}
    if not missing:
        return

    try:
        for line in zprofile.read_text().splitlines():
            line = line.strip()
            if not line.startswith("export "):
                continue
            rest = line[len("export "):]
            if "=" not in rest:
                continue
            key, _, value = rest.partition("=")
            key = key.strip()
            value = value.strip().strip('"').strip("'")
            if key in missing and value:
                os.environ[key] = value
                missing.discard(key)
                print(f"  [env] Sourced {key} from ~/.zprofile", file=sys.stderr)
    except Exception as e:
        print(f"  [env] Warning: could not parse ~/.zprofile: {e}", file=sys.stderr)


# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------


def load_config(config_path: Path) -> dict:
    """Load council configuration from JSON file."""
    if not config_path.exists():
        print(f"ERROR: Config not found: {config_path}", file=sys.stderr)
        sys.exit(1)
    with open(config_path) as f:
        return json.load(f)


def get_active_members(config: dict, review_type: str) -> list[dict]:
    """Return only council members whose phases include the review type."""
    return [
        m for m in config["council"]["members"]
        if review_type in m.get("phases", ["plan", "code"])
    ]


def validate_api_keys(config: dict, active_members: list[dict]) -> dict[str, str]:
    """Validate API keys required by active members + consolidator."""
    required = set()
    optional = set()
    for member in active_members:
        env = member.get("api_key_env")
        if env:
            required.add(env)
        fallback = member.get("fallback")
        if fallback and fallback.get("api_key_env"):
            optional.add(fallback["api_key_env"])

    consolidator = config["council"]["consolidator"]
    cons_env = consolidator.get("api_key_env")
    if cons_env:
        required.add(cons_env)
    consolidator_fb = consolidator.get("fallback")
    if consolidator_fb and consolidator_fb.get("api_key_env"):
        optional.add(consolidator_fb["api_key_env"])

    keys = {}
    missing = []
    for env_var in sorted(required):
        val = os.environ.get(env_var)
        if val:
            keys[env_var] = val
        else:
            missing.append(env_var)

    if missing:
        print(f"ERROR: Missing required API key(s): {', '.join(missing)}", file=sys.stderr)
        print("Set them in your environment before running council review.", file=sys.stderr)
        sys.exit(1)

    for env_var in sorted(optional - required):
        val = os.environ.get(env_var)
        if val:
            keys[env_var] = val

    return keys


# ---------------------------------------------------------------------------
# API Clients
# ---------------------------------------------------------------------------


def call_google(
    model: str, contents: str,
    max_tokens: int, temperature: float, api_key: str, timeout: float,
) -> str:
    """Call Google GenAI API."""
    from google import genai
    client = genai.Client(api_key=api_key)
    response = client.models.generate_content(
        model=model,
        contents=contents,
        config={"max_output_tokens": max_tokens, "temperature": temperature},
    )
    text = response.text
    if text is None:
        raise RuntimeError("Google API returned empty/blocked response (safety filter or quota exceeded)")
    return text


def call_anthropic(
    model: str, system: str, user_content: str,
    max_tokens: int, temperature: float, api_key: str, timeout: float,
) -> str:
    """Call Anthropic API."""
    import anthropic
    client = anthropic.Anthropic(api_key=api_key)
    message = client.messages.create(
        model=model,
        max_tokens=max_tokens,
        temperature=temperature,
        system=system,
        messages=[{"role": "user", "content": user_content}],
    )
    return message.content[0].text


def call_codex(
    system: str, user_content: str, timeout: float,
    review_mode: bool = False,
) -> str:
    """Call Codex CLI using account auth."""
    combined_prompt = f"{system}\n\n---\n\n{user_content}"

    with tempfile.NamedTemporaryFile(mode="w", suffix=".md", delete=False) as f:
        f.write(combined_prompt)
        prompt_file = f.name

    try:
        if review_mode:
            cmd = ["codex", "review", "--uncommitted", "-"]
            result = subprocess.run(
                cmd,
                input=combined_prompt,
                capture_output=True, text=True, timeout=timeout,
            )
        else:
            cmd = ["codex", "exec", "--full-auto"]
            result = subprocess.run(
                cmd,
                input=combined_prompt,
                capture_output=True, text=True, timeout=timeout,
            )
    except FileNotFoundError:
        raise RuntimeError("Codex CLI not found. Install: npm install -g @openai/codex")
    except subprocess.TimeoutExpired:
        raise RuntimeError(f"Codex timed out after {timeout:.0f}s")
    finally:
        try:
            os.unlink(prompt_file)
        except OSError:
            pass

    if result.returncode != 0:
        stderr_first_line = (result.stderr or "").split("\n")[0][:120]
        print(f"  [debug] Codex stderr: {stderr_first_line}", file=sys.stderr)
        raise RuntimeError(f"Codex exited {result.returncode}")
    output = result.stdout.strip()
    if not output:
        raise RuntimeError("Codex produced no output")
    return output


def call_model(
    platform: str, model: str, system: str, user_content: str,
    max_tokens: int, temperature: float, api_key: str, timeout: float,
    review_mode: bool = False,
) -> str:
    """Dispatch to the appropriate platform API."""
    if platform == "google":
        combined = f"{system}\n\n---\n\n{user_content}"
        return call_google(model, combined, max_tokens, temperature, api_key, timeout)
    elif platform == "anthropic":
        return call_anthropic(model, system, user_content, max_tokens, temperature, api_key, timeout)
    elif platform == "codex":
        return call_codex(system, user_content, timeout, review_mode=review_mode)
    else:
        raise ValueError(f"Unknown platform: {platform}")


# ---------------------------------------------------------------------------
# Material Gathering
# ---------------------------------------------------------------------------


def read_file_safe(path: Path, max_lines: int = 500) -> str:
    """Read a file, truncating if too long."""
    if not path.exists():
        return f"[File not found: {path}]"
    try:
        lines = path.read_text().splitlines()
        if len(lines) > max_lines:
            return "\n".join(lines[:max_lines]) + f"\n\n[... truncated, {len(lines)} total lines]"
        return "\n".join(lines)
    except Exception as e:
        return f"[Error reading {path}: {e}]"


def get_changed_files(sprint: str | None = None, repo_root: Path | None = None) -> list[str]:
    """Get list of changed files for code review."""
    # Strategy 1: Sprint-aware diff from recorded base commit
    if sprint and repo_root:
        base_file = repo_root / f".sprint-base-commit-{sprint}"
        if base_file.exists():
            base_sha = base_file.read_text().strip()
            result = subprocess.run(
                ["git", "diff", "--name-only", f"{base_sha}..HEAD"],
                capture_output=True, text=True,
            )
            if result.returncode == 0 and result.stdout.strip():
                files = [f for f in result.stdout.strip().split("\n") if f]
                if files:
                    return files

    # Strategy 2: Uncommitted changes
    result = subprocess.run(
        ["git", "diff", "--name-only", "HEAD"],
        capture_output=True, text=True,
    )
    if result.stdout.strip():
        files = [f for f in result.stdout.strip().split("\n") if f]
        if files:
            return files

    # Strategy 3: Recent commits
    result = subprocess.run(
        ["git", "diff", "--name-only", "HEAD~10..HEAD"],
        capture_output=True, text=True,
    )
    if result.stdout.strip():
        files = [f for f in result.stdout.strip().split("\n") if f]
        if files:
            return files

    # Strategy 4: Parse plan file for expected files
    if sprint and repo_root:
        plan_file = repo_root / f"PLAN_Sprint{sprint}.md"
        if plan_file.exists():
            files = _parse_plan_file_list(plan_file)
            if files:
                return files

    return []


def _parse_plan_file_list(plan_file: Path) -> list[str]:
    """Extract file paths from the 'Files to Create/Modify' table in a PLAN file."""
    in_table = False
    files = []
    for line in plan_file.read_text().splitlines():
        if "Files to Create/Modify" in line or "Files Changed" in line:
            in_table = True
            continue
        if in_table:
            if line.startswith("|") and "`" in line:
                parts = line.split("`")
                if len(parts) >= 2:
                    path = parts[1].strip()
                    if path and not path.startswith("--"):
                        files.append(path)
            elif line.strip() == "" or line.startswith("#"):
                in_table = False
    return files


def gather_plan_materials(sprint: str, repo_root: Path) -> str:
    """Gather materials for a plan review."""
    sections = []

    plan_file = repo_root / f"PLAN_Sprint{sprint}.md"
    if plan_file.exists():
        content = read_file_safe(plan_file, max_lines=1000)
        sections.append(f"### {plan_file.name} (PRIMARY — this is what you are reviewing)\n```\n{content}\n```")
    else:
        print(f"ERROR: Plan file not found: {plan_file}", file=sys.stderr)
        sys.exit(1)

    changes_file = repo_root / "CHANGES.md"
    if changes_file.exists():
        content = read_file_safe(changes_file, max_lines=200)
        sections.append(f"### CHANGES.md (project history)\n```\n{content}\n```")

    history_file = repo_root / "Documentation" / "PLAN_history.md"
    if history_file.exists():
        content = read_file_safe(history_file, max_lines=300)
        sections.append(f"### Documentation/PLAN_history.md (prior decisions, truncated)\n```\n{content}\n```")

    return "\n\n".join(sections)


def gather_code_materials(sprint: str, repo_root: Path) -> str:
    """Gather materials for a code review."""
    sections = []

    plan_file = repo_root / f"PLAN_Sprint{sprint}.md"
    if plan_file.exists():
        content = read_file_safe(plan_file, max_lines=700)
        sections.append(f"### {plan_file.name} (approved plan)\n```\n{content}\n```")

    changes_file = repo_root / "CHANGES.md"
    if changes_file.exists():
        content = read_file_safe(changes_file, max_lines=200)
        sections.append(f"### CHANGES.md\n```\n{content}\n```")

    changed_files = get_changed_files(sprint=sprint, repo_root=repo_root)
    source_extensions = {
        ".py", ".js", ".ts", ".jsx", ".tsx", ".go", ".rs", ".java",
        ".rb", ".swift", ".kt", ".cs", ".cpp", ".c", ".h",
        ".yml", ".yaml", ".toml", ".json", ".sh", ".html", ".css",
    }
    source_files = [
        f for f in changed_files
        if Path(f).suffix in source_extensions
        and not f.startswith("Documentation/")
        and "PLAN_" not in f
        and "REVIEW_" not in f
    ]

    for f in source_files[:25]:
        full_path = repo_root / f
        content = read_file_safe(full_path, max_lines=1300)
        ext = Path(f).suffix.lstrip(".")
        sections.append(f"### {f}\n```{ext}\n{content}\n```")

    if changed_files:
        file_list = "\n".join(f"- {f}" for f in changed_files)
        sections.insert(0, f"### Changed Files\n{file_list}")

    return "\n\n".join(sections)


# ---------------------------------------------------------------------------
# Prompt Construction
# ---------------------------------------------------------------------------


def build_council_prompt(
    member: dict, materials: str,
    sprint: str, title: str, round_num: int, review_type: str,
    tracker_content: str | None = None,
) -> tuple[str, str]:
    """Build system + user prompts for a council member. Returns (system, user)."""
    role = member["role"]
    label = member["label"]
    lens = member["lens"]

    if round_num == 1:
        round_context = "This is the first review of this plan."
    else:
        round_context = (
            f"This is round {round_num}. The artifact has been revised to address "
            f"findings from previous rounds.\n\n"
            f"FOCUS on:\n"
            f"1. Whether previous findings have been adequately addressed\n"
            f"2. Any genuinely NEW issues introduced by the revisions\n\n"
            f"Do NOT re-raise findings that have been marked ADDRESSED in the tracker "
            f"unless the fix is demonstrably incomplete. Do NOT introduce novel concerns "
            f"about previously-reviewed sections that haven't changed."
        )

    tracker_section = ""
    if tracker_content and round_num > 1:
        tracker_section = f"""

## Prior Findings Tracker
Items marked ADDRESSED have been fixed by the editor. Items marked RECURRING have
appeared 3+ times and are accepted as Known Debt — do NOT re-flag them.

{tracker_content}
"""

    review_type_label = "plan" if review_type == "plan" else "code implementation"

    system_prompt = f"""You are {label} on a review council for a pair programming workflow.

## Your Review Lens
{lens}"""

    user_prompt = f"""## Review Type
This is a {review_type_label} review for Sprint {sprint}: {title} (Round {round_num}).
{round_context}
{tracker_section}
## Materials Under Review
{materials}

## Output Format

Write your review in EXACTLY this structure:

### {role} Review: Sprint {sprint} (R{round_num})

**Scope:** {label}

#### Findings
List findings ONLY within your area of focus. For each finding, include the file path and location:
- **[High]** description (File: `path/to/file`, Location: function_name or line range)
  - Current: what exists now
  - Fix: specific action to take
- **[Medium]** description (File: `path/to/file`, Location: function_name or line range)
  - Current: what exists now
  - Fix: specific action to take
- **[Low]** description (File: `path/to/file` if applicable)

If you find NO issues in your area, write: "No findings in this area."

#### Assessment
A 2-3 sentence overall assessment of the {review_type_label} from your expert perspective.

IMPORTANT:
- Stay strictly within your area of expertise
- Do NOT comment on areas outside your lens
- Be specific: cite file paths, line numbers (for code), or section names (for plans)
- For each finding, explain WHAT is wrong AND HOW to fix it
- Be EXHAUSTIVE in Round 1: list ALL concerns you can identify in a single pass. The goal is zero new findings from your area in R2+.
- In Round 2+: do NOT re-flag ADDRESSED or RECURRING items from the tracker"""

    return system_prompt, user_prompt


def build_consolidator_prompt(
    council_reviews: dict[str, str],
    sprint: str, title: str, round_num: int, review_type: str,
    member_labels: dict[str, str],
    tracker_content: str | None = None,
    escalation_note: str | None = None,
) -> tuple[str, str]:
    """Build system + user prompts for the consolidator."""
    review_type_cap = "Plan" if review_type == "plan" else "Code"

    review_sections = []
    for role, review_text in council_reviews.items():
        label = member_labels.get(role, role.title())
        review_sections.append(f"### {label}\n{review_text}")
    all_reviews = "\n\n---\n\n".join(review_sections)

    successful_count = sum(1 for r in council_reviews.values() if "UNAVAILABLE" not in r)

    system_prompt = """You are the Consolidation Lead for a review council. Multiple domain experts have independently reviewed a plan or implementation. Your job is to synthesise their findings into a single, coherent review with one verdict."""

    if review_type == "plan":
        assessment_sections = """### Design Assessment
[Synthesised evaluation of the proposed approach]

### Completeness
[Does the plan cover all deliverables and edge cases?]"""
    else:
        assessment_sections = """### Implementation Assessment
[Does the code correctly implement the approved plan?]

### Code Quality
[Synthesised assessment of clarity, documentation, error handling]

### Test Coverage
[Synthesised assessment of test adequacy]"""

    tracker_section = ""
    if tracker_content and round_num > 1:
        tracker_section = f"""

## Prior Findings Tracker
Items marked ADDRESSED have been fixed. Do NOT re-flag ADDRESSED items unless the fix is demonstrably incomplete.

{tracker_content}
"""

    escalation_section = ""
    if escalation_note:
        escalation_section = f"\n{escalation_note}\n"

    user_prompt = f"""## Council Reviews

{all_reviews}
{tracker_section}{escalation_section}
## Consolidation Instructions

1. **Identify overlapping concerns**: Merge findings on the same underlying issue across experts.
2. **Resolve conflicts**: If experts disagree, use judgement to determine which concern dominates.
3. **Filter false positives**: Exclude speculative or out-of-lens findings.
4. **Assign final severity**:
   - [High]: Would cause a bug, security vulnerability, data loss, or spec violation. Blocks approval.
   - [Medium]: Would cause maintainability, performance, or usability problems.
   - [Low]: Improvement suggestion. Optional.
5. **Determine verdict**:
   - APPROVED: Zero [High] findings AND overall design/implementation is sound
   - CHANGES_REQUESTED: One or more [High] findings, OR three or more [Medium] in same area
   - PLAN_REVISION_REQUIRED (code reviews only): Fundamental design flaw discovered during implementation

## Output Format

## {review_type_cap} Review: Sprint {sprint} - {title} (R{round_num})

**Round:** {round_num}
**Verdict:** APPROVED | CHANGES_REQUESTED{" | PLAN_REVISION_REQUIRED" if review_type == "code" else ""}
**Review Method:** Council of Experts ({successful_count} reviewers + consolidator)

{assessment_sections}

### Findings
- **[High]** description (File: `path/to/file`, Location: function_name) (Source: expert_name)
- **[Medium]** description (Source: expert_name)
- **[Low]** description (Source: expert_name)

### Excluded Findings
- description — Reason: why excluded (Source: expert_name)
[If none, write "No findings excluded."]

### Required Changes (if CHANGES_REQUESTED)
For each required change:
1. **File**: exact file path
   **Location**: function/class name or line range
   **Current behavior**: what exists now
   **Required change**: exactly what must change
   **Acceptance criteria**: how to verify the fix

{"### Plan Revisions (if PLAN_REVISION_REQUIRED)" + chr(10) + "[What needs to change in the plan]" + chr(10) if review_type == "code" else ""}
### Recommendations
[Consolidated optional improvements]

### Expert Concordance
| Area | Experts Agreeing | Key Theme |
|------|-----------------|-----------|
| ... | ... | ... |"""

    return system_prompt, user_prompt


# ---------------------------------------------------------------------------
# Council Execution
# ---------------------------------------------------------------------------

_codex_call_index = 0
_codex_call_lock = None


def _call_member(
    platform: str, model: str, api_key_env: str,
    system_prompt: str, user_prompt: str,
    max_tokens: int, temperature: float,
    api_keys: dict, timeout: float,
    review_mode: bool = False,
) -> str:
    """Make a single API call for a council member."""
    api_key = None if platform == "codex" else api_keys.get(api_key_env, "")
    return call_model(
        platform=platform,
        model=model,
        system=system_prompt,
        user_content=user_prompt,
        max_tokens=max_tokens,
        temperature=temperature,
        api_key=api_key,
        timeout=timeout,
        review_mode=review_mode,
    )


def run_council_member(
    member: dict, materials: str, api_keys: dict,
    sprint: str, title: str, round_num: int, review_type: str,
    timeout: float,
    codex_stagger: float = 0,
    retry_delay: float = 5,
    tracker_content: str | None = None,
) -> tuple[str, str, float]:
    """Run a single council member with retry + fallback. Returns (role, review_text, elapsed_seconds)."""
    global _codex_call_index, _codex_call_lock

    role = member["role"]
    start = time.monotonic()

    system_prompt, user_prompt = build_council_prompt(
        member, materials, sprint, title, round_num, review_type,
        tracker_content=tracker_content,
    )

    review_mode = (review_type == "code")

    if member["platform"] == "codex" and codex_stagger > 0 and _codex_call_lock:
        import threading
        with _codex_call_lock:
            idx = _codex_call_index
            _codex_call_index += 1
        delay = idx * codex_stagger
        if delay > 0:
            print(f"    {member['label']:25s} stagger {delay:.0f}s...", file=sys.stderr)
            time.sleep(delay)

    primary_err = None
    for attempt in range(2):
        try:
            review = _call_member(
                member["platform"], member["model"], member["api_key_env"],
                system_prompt, user_prompt,
                member["max_tokens"], member["temperature"],
                api_keys, timeout,
                review_mode=review_mode,
            )
            elapsed = time.monotonic() - start
            return role, review, elapsed
        except Exception as err:
            primary_err = err
            primary_type = type(err).__name__
            if attempt == 0:
                print(f"  [debug] {member['label']} attempt 1 failed ({primary_type}), retrying in {retry_delay}s...", file=sys.stderr)
                time.sleep(retry_delay)
            else:
                print(f"  [debug] {member['label']} attempt 2 failed ({primary_type}): {err}", file=sys.stderr)

    fallback = member.get("fallback")
    fb_key_env = fallback.get("api_key_env") if fallback else None
    fb_available = fallback and (fallback.get("platform") == "codex" or fb_key_env in api_keys)
    primary_type = type(primary_err).__name__

    if fb_available:
        fb_platform = fallback["platform"]
        fb_model = fallback["model"]
        print(
            f"  WARNING: {member['label']} primary failed ({member['platform']}/{member['model']}), "
            f"trying fallback ({fb_platform}/{fb_model})...",
            file=sys.stderr,
        )
        try:
            review = _call_member(
                fb_platform, fb_model, fallback.get("api_key_env"),
                system_prompt, user_prompt,
                member["max_tokens"], member["temperature"],
                api_keys, timeout,
                review_mode=review_mode,
            )
            elapsed = time.monotonic() - start
            return role, review, elapsed
        except Exception as fb_err:
            fb_type = type(fb_err).__name__
            print(f"  [debug] {member['label']} fallback error: {fb_type}: {fb_err}", file=sys.stderr)
            opaque_msg = f"{primary_type} (primary) / {fb_type} (fallback)"
    else:
        opaque_msg = f"{primary_type}"

    elapsed = time.monotonic() - start
    placeholder = (
        f"### {role} Review: Sprint {sprint} (R{round_num})\n\n"
        f"**Status:** UNAVAILABLE\n"
        f"**Error:** ({opaque_msg})\n\n"
        f"This expert was unable to complete their review."
    )
    return role, placeholder, elapsed


def run_consolidator(
    config: dict, council_reviews: dict[str, str],
    member_labels: dict[str, str],
    sprint: str, title: str, round_num: int, review_type: str,
    api_keys: dict,
    tracker_content: str | None = None,
    escalation_note: str | None = None,
) -> str:
    """Run the consolidator to produce the final unified review."""
    consolidator = config["council"]["consolidator"]
    timeout = config["council"].get("consolidator_timeout_seconds", 180)
    retry_delay = config["council"].get("retry_delay_seconds", 5)

    system_prompt, user_prompt = build_consolidator_prompt(
        council_reviews, sprint, title, round_num, review_type, member_labels,
        tracker_content=tracker_content,
        escalation_note=escalation_note,
    )

    primary_err = None
    platform = consolidator["platform"]
    api_key_env = consolidator.get("api_key_env")
    api_key = None if platform == "codex" else api_keys.get(api_key_env, "")

    for attempt in range(2):
        try:
            return call_model(
                platform=platform,
                model=consolidator["model"],
                system=system_prompt,
                user_content=user_prompt,
                max_tokens=consolidator["max_tokens"],
                temperature=consolidator["temperature"],
                api_key=api_key,
                timeout=timeout,
            )
        except Exception as err:
            primary_err = err
            if attempt == 0:
                print(f"  [debug] Consolidator attempt 1 failed ({type(err).__name__}), retrying...", file=sys.stderr)
                time.sleep(retry_delay)
            else:
                print(f"  [debug] Consolidator attempt 2 failed: {err}", file=sys.stderr)

    fallback = consolidator.get("fallback")
    fb_key_env = fallback.get("api_key_env") if fallback else None
    fb_available = fallback and (fallback.get("platform") == "codex" or fb_key_env in api_keys)
    if fb_available:
        fb_platform = fallback["platform"]
        fb_model = fallback["model"]
        fb_api_key = None if fb_platform == "codex" else api_keys.get(fb_key_env, "")
        try:
            return call_model(
                platform=fb_platform, model=fb_model,
                system=system_prompt, user_content=user_prompt,
                max_tokens=consolidator["max_tokens"], temperature=consolidator["temperature"],
                api_key=fb_api_key, timeout=timeout,
            )
        except Exception as fb_err:
            print(f"  [debug] Consolidator fallback error: {type(fb_err).__name__}: {fb_err}", file=sys.stderr)

    print(f"  WARNING: Consolidator failed — using fallback consolidation", file=sys.stderr)
    return fallback_consolidation(council_reviews, sprint, title, round_num, review_type)


def fallback_consolidation(
    council_reviews: dict[str, str],
    sprint: str, title: str, round_num: int, review_type: str,
) -> str:
    """Produce a synthetic review from raw council outputs when consolidator fails."""
    review_type_cap = "Plan" if review_type == "plan" else "Code"
    has_high = any("[High]" in r for r in council_reviews.values())
    verdict = "CHANGES_REQUESTED" if has_high else "APPROVED"
    successful_count = sum(1 for r in council_reviews.values() if "UNAVAILABLE" not in r)
    all_reviews = "\n\n---\n\n".join(
        f"### {role.title()}\n{text}" for role, text in council_reviews.items()
    )
    return f"""## {review_type_cap} Review: Sprint {sprint} - {title} (R{round_num})

**Round:** {round_num}
**Verdict:** {verdict}
**Review Method:** Council of Experts ({successful_count} reviewers, consolidator FAILED — raw reviews below)

> Note: The consolidator was unable to synthesise these reviews. The verdict is a mechanical
> determination: CHANGES_REQUESTED if any [High] finding exists, else APPROVED.

{all_reviews}
"""


# ---------------------------------------------------------------------------
# Round Tracking
# ---------------------------------------------------------------------------


def increment_round(sprint: str, review_type: str, repo_root: Path) -> int:
    """Increment and return the review round number."""
    round_file = repo_root / f".review-round-sprint{sprint}-{review_type}"
    round_num = int(round_file.read_text().strip()) if round_file.exists() else 0
    round_num += 1
    round_file.write_text(str(round_num))

    if review_type == "plan" and round_num == 1:
        base_file = repo_root / f".sprint-base-commit-{sprint}"
        if not base_file.exists():
            result = subprocess.run(
                ["git", "rev-parse", "HEAD"],
                capture_output=True, text=True,
            )
            if result.returncode == 0:
                base_file.write_text(result.stdout.strip())

    return round_num


# ---------------------------------------------------------------------------
# Output
# ---------------------------------------------------------------------------


def extract_verdict(review_text: str) -> str:
    """Extract the verdict line from review text."""
    for line in review_text.splitlines():
        if "**Verdict:**" in line:
            return line.strip()
    return ""


# ---------------------------------------------------------------------------
# Findings Tracker
# ---------------------------------------------------------------------------


def _parse_findings(review_text: str, round_num: int) -> list[dict]:
    """Extract findings from consolidated review markdown."""
    findings = []
    finding_id = 0
    for line in review_text.splitlines():
        line_stripped = line.strip()
        if not (line_stripped.startswith("-") and "**[" in line_stripped):
            continue
        severity = None
        for sev in ("High", "Medium", "Low"):
            if f"[{sev}]" in line_stripped:
                severity = sev
                break
        if not severity:
            continue
        finding_id += 1
        desc = line_stripped
        marker = f"**[{severity}]**"
        idx = desc.find(marker)
        if idx >= 0:
            desc = desc[idx + len(marker):].strip().lstrip("-").strip()
        if len(desc) > 120:
            desc = desc[:117] + "..."
        findings.append({
            "id": finding_id,
            "round": round_num,
            "severity": severity,
            "description": desc,
            "status": "OPEN",
            "resolution": "",
        })
    return findings


def _read_tracker(tracker_file: Path) -> list[dict]:
    """Parse existing tracker file into findings list."""
    findings = []
    in_table = False
    for line in tracker_file.read_text().splitlines():
        if line.startswith("| #"):
            in_table = True
            continue
        if in_table and line.startswith("|---"):
            continue
        if in_table and line.startswith("|"):
            parts = [p.strip() for p in line.split("|")[1:-1]]
            if len(parts) >= 6:
                fid = parts[0]
                findings.append({
                    "id": int(fid) if fid.isdigit() else 0,
                    "round": int(parts[1].lstrip("R")) if parts[1].lstrip("R").isdigit() else 0,
                    "severity": parts[2],
                    "description": parts[3],
                    "status": parts[4],
                    "resolution": parts[5],
                })
        elif in_table and not line.startswith("|"):
            in_table = False
    return findings


def _text_similarity(a: str, b: str) -> float:
    """Simple word-overlap similarity (Jaccard)."""
    words_a = set(a.lower().split())
    words_b = set(b.lower().split())
    if not words_a or not words_b:
        return 0.0
    return len(words_a & words_b) / len(words_a | words_b)


def _merge_findings(existing: list[dict], new_findings: list[dict], round_num: int) -> list[dict]:
    """Merge new findings with existing tracker.

    Oscillation detection: if a finding is reopened for the 3rd time (i.e., it has
    been ADDRESSED and then re-raised 3+ times), it is auto-marked RECURRING and
    removed from blocking status. This prevents infinite review loops from findings
    that oscillate between fix attempts.
    """
    merged = list(existing)
    next_id = max((f["id"] for f in merged), default=0) + 1

    for nf in new_findings:
        matched = False
        for ef in merged:
            if (ef["severity"] == nf["severity"]
                    and _text_similarity(ef["description"], nf["description"]) > 0.4):
                matched = True
                if ef["status"] in ("ADDRESSED", "REOPENED"):
                    # Count how many times this finding has been reopened
                    reopen_count = ef["resolution"].count("Reopened")
                    if reopen_count >= 2:
                        # 3rd reopen — mark as RECURRING (oscillating)
                        ef["status"] = "RECURRING"
                        ef["resolution"] += f" [Oscillating — auto-demoted to Known Debt at R{round_num}]"
                    else:
                        ef["status"] = "REOPENED"
                        ef["resolution"] += f" [Reopened R{round_num}]"
                # Skip RECURRING findings — they stay as Known Debt
                break
        if not matched:
            nf["id"] = next_id
            nf["round"] = round_num
            next_id += 1
            merged.append(nf)

    return merged


def _write_tracker(tracker_file: Path, sprint: str, findings: list[dict], review_type: str) -> None:
    """Write findings tracker as markdown table."""
    lines = [
        f"# Findings Tracker: Sprint {sprint} ({review_type})",
        "",
        "Editor: Update the **Status** and **Resolution** columns after addressing each finding.",
        "Status values: `OPEN` | `ADDRESSED` | `VERIFIED` | `WONTFIX` | `REOPENED`",
        "",
        "| # | Round | Severity | Finding | Status | Resolution |",
        "|---|-------|----------|---------|--------|------------|",
    ]
    for f in findings:
        lines.append(
            f"| {f['id']} | R{f['round']} | {f['severity']} "
            f"| {f['description']} | {f['status']} | {f['resolution']} |"
        )
    lines.append("")
    tracker_file.write_text("\n".join(lines))


def update_findings_tracker(
    sprint: str, round_num: int, review_text: str,
    review_type: str, repo_root: Path,
) -> Path:
    """Parse findings from consolidated review and update the tracker file."""
    tracker_file = repo_root / f"FINDINGS_Sprint{sprint}.md"
    new_findings = _parse_findings(review_text, round_num)

    if not tracker_file.exists():
        _write_tracker(tracker_file, sprint, new_findings, review_type)
    else:
        existing = _read_tracker(tracker_file)
        merged = _merge_findings(existing, new_findings, round_num)
        _write_tracker(tracker_file, sprint, merged, review_type)

    return tracker_file


def compute_convergence_score(tracker_file: Path) -> tuple[float, str]:
    """Compute convergence score from tracker."""
    if not tracker_file.exists():
        return 0.0, "No tracker"
    findings = _read_tracker(tracker_file)
    if not findings:
        return 1.0, "No findings"
    total = len(findings)
    resolved = sum(1 for f in findings if f["status"] in ("ADDRESSED", "VERIFIED", "WONTFIX"))
    open_count = sum(1 for f in findings if f["status"] == "OPEN")
    reopened = sum(1 for f in findings if f["status"] == "REOPENED")
    score = resolved / total if total > 0 else 1.0
    desc = f"{resolved}/{total} resolved, {open_count} open, {reopened} reopened"
    return score, desc


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------


def main():
    global _codex_call_index, _codex_call_lock

    if len(sys.argv) < 4:
        print("Usage: ./scripts/council-review.py <plan|code> <sprint> <title>")
        print()
        print("  plan  — Review the implementation plan in PLAN_Sprint<N>.md")
        print("  code  — Review the implementation (changed files since plan approval)")
        print()
        print("Examples:")
        print('  ./scripts/council-review.py plan 1 "Initial Setup"')
        print('  ./scripts/council-review.py code 1 "Initial Setup"')
        sys.exit(1)

    review_type = sys.argv[1]
    sprint = sys.argv[2]
    title = " ".join(sys.argv[3:])

    if review_type not in ("plan", "code"):
        print(f"ERROR: review_type must be 'plan' or 'code', got '{review_type}'", file=sys.stderr)
        sys.exit(1)

    ensure_api_keys_from_profile()

    repo_root = Path(subprocess.run(
        ["git", "rev-parse", "--show-toplevel"],
        capture_output=True, text=True,
    ).stdout.strip())

    config_path = repo_root / "scripts" / "council-config.json"
    config = load_config(config_path)

    active_members = get_active_members(config, review_type)
    if not active_members:
        print(f"ERROR: No council members configured for '{review_type}' phase", file=sys.stderr)
        sys.exit(1)

    api_keys = validate_api_keys(config, active_members)
    round_num = increment_round(sprint, review_type, repo_root)

    # Print header
    consolidator = config["council"]["consolidator"]
    print(f"==> Council review for Sprint {sprint}: {title} (Round {round_num})")
    print(f"    Review type:    {review_type}")
    print(f"    Active members: {len(active_members)}")
    for m in active_members:
        print(f"      - {m['label']:25s} ({m['platform']}/{m['model']})")
    print(f"    Consolidator:   {consolidator['platform']}/{consolidator['model']}")
    print()

    # Gather materials
    print("  Gathering materials...")
    if review_type == "plan":
        materials = gather_plan_materials(sprint, repo_root)
    else:
        materials = gather_code_materials(sprint, repo_root)
    print(f"  Materials: {len(materials):,} chars")

    # Redact secrets before sending externally
    materials = redact_secrets(materials)
    print()

    # Read findings tracker (needed by both council members and consolidator)
    tracker_file = repo_root / f"FINDINGS_Sprint{sprint}.md"
    tracker_content = tracker_file.read_text() if tracker_file.exists() else None

    # Prepare council output directory
    output_dir_value = config["council"].get("output_dir", "council")
    council_dir = (repo_root / output_dir_value).resolve()
    repo_root_resolved = repo_root.resolve()
    if not str(council_dir).startswith(str(repo_root_resolved) + os.sep):
        print(f"ERROR: council.output_dir resolves outside repo root. Refusing.", file=sys.stderr)
        sys.exit(1)
    if council_dir.exists():
        shutil.rmtree(council_dir)
    council_dir.mkdir(parents=True)

    member_labels = {m["role"]: m["label"] for m in active_members}

    codex_stagger = config["council"].get("codex_stagger_seconds", 2)
    retry_delay = config["council"].get("retry_delay_seconds", 5)

    import threading
    _codex_call_index = 0
    _codex_call_lock = threading.Lock()

    parallel_timeout = config["council"].get("parallel_timeout_seconds", 180)

    print(f"  Running {len(active_members)} council members in parallel...")
    council_reviews: dict[str, str] = {}

    with ThreadPoolExecutor(max_workers=len(active_members)) as executor:
        futures = {
            executor.submit(
                run_council_member,
                member, materials, api_keys,
                sprint, title, round_num, review_type,
                parallel_timeout,
                codex_stagger=codex_stagger,
                retry_delay=retry_delay,
                tracker_content=tracker_content,
            ): member
            for member in active_members
        }

        for future in as_completed(futures):
            member = futures[future]
            try:
                role, review_text, elapsed = future.result(timeout=parallel_timeout + 30)
                council_reviews[role] = review_text
                review_file = council_dir / f"{role}.md"
                review_file.write_text(review_text)
                status = "UNAVAILABLE" if "UNAVAILABLE" in review_text else "done"
                print(f"    {member['label']:25s} {status:12s} ({elapsed:.1f}s)")
            except Exception as e:
                role = member["role"]
                print(f"  [debug] {member['label']} future error: {type(e).__name__}: {e}", file=sys.stderr)
                council_reviews[role] = (
                    f"### {role} Review: Sprint {sprint} (R{round_num})\n\n"
                    f"**Status:** UNAVAILABLE\n"
                    f"**Error:** ({type(e).__name__})\n\n"
                    f"This expert was unable to complete their review."
                )
                print(f"    {member['label']:25s} FAILED       ({type(e).__name__})")

    successful = sum(1 for r in council_reviews.values() if "UNAVAILABLE" not in r)
    print()
    print(f"  Council complete: {successful}/{len(active_members)} experts succeeded")

    if successful < QUORUM_THRESHOLD:
        print(f"  ERROR: Quorum not met ({successful} < {QUORUM_THRESHOLD}). Aborting.", file=sys.stderr)
        sys.exit(1)

    max_rounds_key = "max_plan_rounds" if review_type == "plan" else "max_code_rounds"
    max_rounds = config["council"].get(max_rounds_key, 8)
    warning_at = config["council"].get("convergence_warning_at", 3)

    escalation_note = None
    if round_num > max_rounds:
        escalation_note = (
            f"\nESCALATION: This is round {round_num}, exceeding the configured maximum "
            f"of {max_rounds}. You MUST:\n"
            f"1. Only flag genuinely NEW [High] findings not present in prior rounds\n"
            f"2. If no new [High] findings exist, verdict MUST be APPROVED\n"
            f"3. List all unresolved items in a 'Known Debt' section instead of blocking\n"
        )

    print(f"  Running consolidator...")
    start = time.monotonic()
    consolidated = run_consolidator(
        config, council_reviews, member_labels,
        sprint, title, round_num, review_type, api_keys,
        tracker_content=tracker_content,
        escalation_note=escalation_note,
    )
    elapsed = time.monotonic() - start
    print(f"  Consolidator complete ({elapsed:.1f}s)")

    review_output_file = repo_root / f"REVIEW_Sprint{sprint}.md"
    review_output_file.write_text(consolidated)
    print()
    print(f"==> Review written to {review_output_file.name}")

    tracker_file = update_findings_tracker(sprint, round_num, consolidated, review_type, repo_root)
    print(f"    Findings tracker: {tracker_file.name}")

    verdict = extract_verdict(consolidated)
    if verdict:
        print(f"    {verdict}")
    else:
        print("    WARNING: No verdict found in consolidated review")

    # ----- Forced verdict logic: override consolidator after max rounds -----
    if round_num > max_rounds and verdict and "APPROVED" not in verdict:
        # Check if there are genuinely new [High] findings in this round
        updated_findings = _read_tracker(tracker_file)
        new_high_this_round = [
            f for f in updated_findings
            if f["round"] == round_num
            and f["severity"] == "High"
            and f["status"] == "OPEN"
        ]
        if not new_high_this_round:
            # No new [High] findings — force APPROVED with Known Debt
            print()
            print(f"  FORCED VERDICT: No new [High] findings at round {round_num} (past max {max_rounds}).")
            print(f"  Overriding consolidator verdict to APPROVED with Known Debt.")

            # Rewrite the verdict in the review file
            consolidated_forced = re.sub(
                r"(\*\*Verdict:\*\*\s*).*",
                r"\1APPROVED (forced — max rounds exceeded, no new [High] findings)",
                consolidated,
                count=1,
            )
            # Also rewrite ## Verdict: line if present
            consolidated_forced = re.sub(
                r"(## Verdict:\s*).*",
                r"\1APPROVED (forced — max rounds exceeded, no new [High] findings)",
                consolidated_forced,
                count=1,
            )

            # Append Known Debt section if not already present
            if "## Known Debt" not in consolidated_forced:
                open_items = [f for f in updated_findings if f["status"] in ("OPEN", "REOPENED", "RECURRING")]
                if open_items:
                    debt_lines = ["\n\n## Known Debt\n",
                                  "The following items remain unresolved but are accepted as known debt:\n"]
                    for item in open_items:
                        debt_lines.append(f"- [{item['severity']}] {item['description']} (from R{item['round']}, status: {item['status']})")
                    consolidated_forced += "\n".join(debt_lines) + "\n"

            review_output_file.write_text(consolidated_forced)
            verdict = "APPROVED (forced — max rounds exceeded, no new [High] findings)"
            print(f"    Updated verdict: {verdict}")
        else:
            print()
            print(f"  WARNING: {len(new_high_this_round)} new [High] finding(s) at round {round_num} despite exceeding max rounds.")
            print(f"  These are genuinely new concerns. The editor should address them or escalate to the human.")

    # ----- Convergence reporting -----
    if round_num > 1:
        score, desc = compute_convergence_score(tracker_file)
        print(f"    Convergence: {score:.0%} ({desc})")
        if score < 0.5 and round_num >= warning_at:
            print(f"    WARNING: Low convergence at round {round_num}. Consider addressing [High] items only.")

    # ----- Check for oscillating findings -----
    all_findings = _read_tracker(tracker_file)
    recurring_count = sum(1 for f in all_findings if f["status"] == "RECURRING")
    if recurring_count > 0:
        print(f"    RECURRING: {recurring_count} finding(s) marked as oscillating Known Debt")

    print()
    if verdict and "APPROVED" in verdict and "CHANGES_REQUESTED" not in verdict:
        if review_type == "plan":
            print("  Next: Proceed to implementation (Phase 2)")
        else:
            print(f'  Next: ./scripts/archive-plan.sh {sprint} "{title}"')
    else:
        remaining = max_rounds - round_num
        if remaining > 0:
            print(f"  Next: Address findings in FINDINGS_Sprint{sprint}.md, then re-run:")
            print(f'        ./scripts/council-review.py {review_type} {sprint} "{title}"')
            print(f"        ({remaining} round(s) remaining before forced approval)")
        else:
            print(f"  ESCALATION: Max rounds reached. Present unresolved findings to the human.")
            print(f"  Options: cut scope, override with higher max_rounds, or accept Known Debt.")


if __name__ == "__main__":
    main()
