/**
 * Interactive object editors, served as MCP-UI widgets.
 *
 * A tool returns an MCP-UI external-URL resource pointing at /ui/edit/{c}/{id};
 * the host (e.g. Claude) renders it in an iframe. The page is server-rendered
 * from D1 (so it needs no client-side auth to READ), and on Save it postMessages
 * an `update_content` tool call to the host, which runs it (merge, non-strip).
 */

interface Env {
  DB: D1Database;
}

interface Field {
  name: string;
  label: string;
  type: "text" | "textarea" | "date" | "datetime" | "select";
  options?: string[];
  hint?: string;
}

export const EDITOR_SPECS: Record<string, { label: string; fields: Field[]; lessons?: boolean }> = {
  events: {
    label: "event",
    fields: [
      { name: "title", label: "Title", type: "text" },
      { name: "starts_at", label: "Starts", type: "date" },
      { name: "ends_at", label: "Ends", type: "date" },
      { name: "location", label: "Location", type: "text" },
      { name: "description", label: "Description", type: "textarea" },
      { name: "details", label: "Details (running order, notes)", type: "textarea" },
      { name: "availability", label: "Availability", type: "select", options: ["open", "limited", "sold out"] },
    ],
  },
  dates: {
    label: "date",
    fields: [
      { name: "title", label: "Title", type: "text" },
      { name: "date", label: "Date & time", type: "datetime" },
      { name: "note", label: "Note", type: "textarea" },
    ],
  },
  posts: {
    label: "blog post",
    fields: [
      { name: "title", label: "Title", type: "text" },
      { name: "date", label: "Date", type: "date" },
      { name: "excerpt", label: "Excerpt", type: "textarea" },
      { name: "body", label: "Body", type: "textarea" },
    ],
  },
  courses: {
    label: "course",
    fields: [
      { name: "title", label: "Title", type: "text" },
      { name: "description", label: "Description", type: "textarea" },
    ],
    lessons: true,
  },
};

const esc = (s: unknown) =>
  String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function dateVal(v: string) {
  return v ? String(v).slice(0, 10) : "";
}
function datetimeVal(v: string) {
  if (!v) return "";
  const s = String(v);
  const m = s.match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})/);
  if (m) return `${m[1]}T${m[2]}`;
  return s.length >= 10 ? `${s.slice(0, 10)}T00:00` : "";
}

function renderField(f: Field, value: any): string {
  const v = value ?? "";
  const label = `<label class="field"><span>${esc(f.label)}</span>`;
  if (f.type === "textarea") return `${label}<textarea name="${f.name}" rows="4">${esc(v)}</textarea></label>`;
  if (f.type === "select")
    return `${label}<select name="${f.name}">${(f.options || [])
      .map((o) => `<option value="${esc(o)}"${o === v ? " selected" : ""}>${esc(o)}</option>`)
      .join("")}</select></label>`;
  if (f.type === "date") return `${label}<input type="date" name="${f.name}" value="${esc(dateVal(v))}"></label>`;
  if (f.type === "datetime") return `${label}<input type="datetime-local" name="${f.name}" value="${esc(datetimeVal(v))}"></label>`;
  return `${label}<input type="text" name="${f.name}" value="${esc(v)}"></label>`;
}

export function renderEditorPage(collection: string, id: string, doc: any): string {
  const spec = EDITOR_SPECS[collection];
  if (!spec) return `<!doctype html><meta charset=utf-8><body>No editor for ${esc(collection)}.</body>`;
  const fieldsHtml = spec.fields.map((f) => renderField(f, doc[f.name])).join("\n");
  const lessons = spec.lessons ? (doc.lessons || []) : [];

  const lessonsUi = spec.lessons
    ? `<fieldset class="lessons"><legend>Lessons</legend><div id="lessons"></div>
       <button type="button" class="ghost" id="addLesson">+ Add lesson</button></fieldset>`
    : "";

  return `<!doctype html>
<html lang="en-GB"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Edit ${esc(spec.label)}</title>
<style>
  :root{ --teal:#1E4A4A; --gold:#B08A4A; --cream:#F7F1E7; --ink:#252321; --line:#D8CCBA; --ivory:#FFFDF8; }
  *{ box-sizing:border-box; }
  body{ margin:0; font:15px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Raleway,sans-serif; color:var(--ink); background:var(--cream); padding:1.25rem; }
  h1{ font-size:1.15rem; margin:0 0 1rem; }
  h1 small{ color:#7a736c; font-weight:400; }
  form{ display:flex; flex-direction:column; gap:0.9rem; max-width:640px; }
  .field{ display:flex; flex-direction:column; gap:0.3rem; }
  .field span{ font-weight:600; font-size:0.8rem; letter-spacing:0.02em; }
  input,textarea,select{ font:inherit; padding:0.55rem 0.65rem; border:1px solid var(--line); border-radius:4px; background:var(--ivory); width:100%; }
  textarea{ resize:vertical; }
  fieldset.lessons{ border:1px solid var(--line); border-radius:6px; padding:0.8rem; }
  legend{ font-weight:600; font-size:0.8rem; padding:0 0.4rem; }
  .lesson-row{ border:1px solid var(--line); border-radius:4px; padding:0.7rem; margin-bottom:0.7rem; background:var(--ivory); display:flex; flex-direction:column; gap:0.5rem; }
  .lesson-row .rm{ align-self:flex-end; }
  button{ font:inherit; cursor:pointer; }
  .primary{ background:var(--teal); color:#fff; border:1px solid var(--teal); border-radius:4px; padding:0.6rem 1.2rem; font-weight:600; }
  .ghost{ background:transparent; color:var(--teal); border:1px solid var(--line); border-radius:4px; padding:0.4rem 0.8rem; }
  .rm{ background:transparent; border:0; color:#a23; font-size:0.8rem; }
  .actions{ display:flex; align-items:center; gap:1rem; margin-top:0.4rem; }
  #status{ font-size:0.85rem; color:#5a7; }
</style></head>
<body>
  <h1>Edit ${esc(spec.label)} <small>${esc(collection)}/${esc(id)}</small></h1>
  <form id="f">
    ${fieldsHtml}
    ${lessonsUi}
    <div class="actions"><button type="submit" class="primary">Save</button><span id="status"></span></div>
  </form>
<script>
  const collection=${JSON.stringify(collection)}, id=${JSON.stringify(id)};
  const spec=${JSON.stringify(spec.fields)};
  const hasLessons=${JSON.stringify(!!spec.lessons)};
  const seedLessons=${JSON.stringify(lessons)};
  const f=document.getElementById('f'), statusEl=document.getElementById('status');

  function lessonRow(l){
    l=l||{title:'',body:''};
    const row=document.createElement('div'); row.className='lesson-row';
    row.innerHTML='<label class="field"><span>Lesson title</span><input class="l-title" type="text"></label>'
      +'<label class="field"><span>Lesson body</span><textarea class="l-body" rows="3"></textarea></label>'
      +'<button type="button" class="rm">Remove</button>';
    row.querySelector('.l-title').value=l.title||'';
    row.querySelector('.l-body').value=l.body||'';
    row.querySelector('.rm').onclick=()=>row.remove();
    return row;
  }
  if(hasLessons){
    const box=document.getElementById('lessons');
    (seedLessons.length?seedLessons:[{}]).forEach(l=>box.appendChild(lessonRow(l)));
    document.getElementById('addLesson').onclick=()=>box.appendChild(lessonRow());
  }

  f.addEventListener('submit',function(e){
    e.preventDefault();
    const data={};
    for(const fld of spec){ const el=f.elements[fld.name]; if(el) data[fld.name]=el.value; }
    if(hasLessons){
      data.lessons=[...document.querySelectorAll('.lesson-row')].map(r=>({
        title:r.querySelector('.l-title').value, body:r.querySelector('.l-body').value
      })).filter(l=>l.title||l.body);
    }
    const messageId='save-'+Date.now();
    window.parent.postMessage({ type:'tool', messageId, payload:{ toolName:'update_content', params:{ collection, id, data: JSON.stringify(data) } } }, '*');
    statusEl.textContent='Saving…';
  });
  window.addEventListener('message',ev=>{
    const d=ev.data||{};
    if(d.type&&String(d.type).indexOf('response')>-1){ statusEl.textContent='Saved.'; }
  });
</script>
</body></html>`;
}

export function editorResource(baseUrl: string, collection: string, id: string) {
  const url = `${baseUrl}/ui/edit/${encodeURIComponent(collection)}/${encodeURIComponent(id)}`;
  return {
    type: "resource" as const,
    resource: { uri: `ui://juliebale/edit/${collection}/${id}`, mimeType: "text/uri-list", text: url },
  };
}
