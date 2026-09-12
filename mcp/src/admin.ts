/**
 * Media upload page (served at /admin/upload).
 *
 * Drag-drop images/audio -> R2 (PUT /api/media/{key}); video -> Cloudflare
 * Stream (direct upload). Returns the reference to paste into content
 * (an /media path for images, an R2 key for audio, a video id for video).
 *
 * Interim auth: prompts for the bearer API key and keeps it in the browser
 * (localStorage). Real auth replaces this in the hardening phase.
 */
export function renderUploadPage(): string {
  return `<!doctype html>
<html lang="en-GB"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Media upload — Julie Bale</title>
<style>
  :root{ --teal:#1E4A4A; --gold:#B08A4A; --cream:#F7F1E7; --ink:#252321; --line:#D8CCBA; --ivory:#FFFDF8; --muted:#655F58; }
  *{ box-sizing:border-box; } [hidden]{ display:none!important; } body{ margin:0; font:15px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; color:var(--ink); background:var(--cream); padding:1.5rem; max-width:820px; }
  h1{ font-size:1.3rem; margin:0 0 0.3rem; } h2{ font-size:1rem; margin:1.6rem 0 0.6rem; }
  .muted{ color:var(--muted); font-size:0.85rem; }
  .keybar{ display:flex; gap:0.5rem; align-items:center; background:var(--ivory); border:1px solid var(--line); border-radius:6px; padding:0.7rem; margin:0.8rem 0; }
  .keybar input{ flex:1; }
  input,button{ font:inherit; }
  input{ padding:0.5rem 0.6rem; border:1px solid var(--line); border-radius:4px; background:var(--ivory); }
  button{ cursor:pointer; background:var(--teal); color:#fff; border:1px solid var(--teal); border-radius:4px; padding:0.5rem 1rem; }
  button.link{ background:transparent; color:var(--teal); border:0; text-decoration:underline; padding:0; }
  .drop{ border:2px dashed var(--line); border-radius:8px; padding:2.5rem 1rem; text-align:center; color:var(--muted); background:var(--ivory); transition:border-color .15s, background .15s; }
  .drop.over{ border-color:var(--teal); background:#fff; color:var(--ink); }
  .drop label{ color:var(--teal); text-decoration:underline; cursor:pointer; }
  .card{ background:var(--ivory); border:1px solid var(--line); border-radius:6px; padding:0.8rem; margin-top:0.7rem; }
  .card strong{ font-size:0.9rem; }
  .prog{ height:6px; background:#eee; border-radius:3px; overflow:hidden; margin:0.5rem 0; }
  .prog .bar{ height:100%; width:0; background:var(--teal); transition:width .2s; }
  .ref{ font-size:0.85rem; }
  code{ background:#efe9df; padding:0.1rem 0.35rem; border-radius:3px; }
  ul{ list-style:none; padding:0; } li{ padding:0.35rem 0; border-bottom:1px solid var(--line); font-size:0.85rem; display:flex; gap:0.6rem; align-items:center; justify-content:space-between; }
  .copy{ background:transparent; color:var(--teal); border:1px solid var(--line); padding:0.15rem 0.5rem; font-size:0.75rem; }
</style></head>
<body>
  <h1>Media upload</h1>
  <p class="muted">Images and audio go to storage; video goes to Cloudflare Stream. You'll get a reference to paste into a page or lesson.</p>

  <div class="keybar" id="keybar" hidden>
    <label style="flex:1">API key <input id="key" type="password" placeholder="Bearer key" style="width:100%"></label>
    <button id="savekey">Save</button>
  </div>

  <div class="drop" id="drop">Drag files here, or <label>choose files<input id="file" type="file" multiple hidden></label></div>
  <div id="results"></div>

  <h2>In storage</h2>
  <ul id="existing"><li class="muted">Enter your key to list media.</li></ul>

<script>
  var key = localStorage.getItem('jb_key') || "";
  var keybar = document.getElementById('keybar');
  function ensureKey(){ if(!key){ keybar.hidden = false; } }
  document.getElementById('savekey').onclick = function(){
    key = document.getElementById('key').value.trim();
    localStorage.setItem('jb_key', key); keybar.hidden = true; loadExisting();
  };
  ensureKey();
  function H(){ return { Authorization: 'Bearer ' + key }; }

  var drop = document.getElementById('drop');
  ['dragover','dragenter'].forEach(function(e){ drop.addEventListener(e, function(ev){ ev.preventDefault(); drop.classList.add('over'); }); });
  ['dragleave','drop'].forEach(function(e){ drop.addEventListener(e, function(ev){ ev.preventDefault(); drop.classList.remove('over'); }); });
  drop.addEventListener('drop', function(ev){ handleFiles(ev.dataTransfer.files); });
  document.getElementById('file').addEventListener('change', function(ev){ handleFiles(ev.target.files); });
  function handleFiles(files){ Array.prototype.forEach.call(files, upload); }

  function card(name){
    var d = document.createElement('div'); d.className = 'card';
    d.innerHTML = '<strong></strong><div class="prog"><div class="bar"></div></div><div class="ref muted">Uploading…</div>';
    d.querySelector('strong').textContent = name;
    document.getElementById('results').prepend(d); return d;
  }
  function setProg(d,p){ d.querySelector('.bar').style.width = p + '%'; }
  function setRef(d,label,val){
    var ref = d.querySelector('.ref'); ref.className = 'ref';
    ref.innerHTML = label + ': <code></code> <button class="copy">Copy</button>';
    ref.querySelector('code').textContent = val;
    ref.querySelector('.copy').onclick = function(){ navigator.clipboard.writeText(val); this.textContent = 'Copied'; };
  }
  function setErr(d,msg){ var ref = d.querySelector('.ref'); ref.className='ref'; ref.style.color='#a23'; ref.textContent = 'Error: ' + msg; }

  function xhrUpload(url, body, d, headers, method){
    return new Promise(function(res, rej){
      var x = new XMLHttpRequest(); x.open(method || 'POST', url);
      if(headers){ for(var k in headers){ x.setRequestHeader(k, headers[k]); } }
      x.upload.onprogress = function(e){ if(e.lengthComputable) setProg(d, Math.round(e.loaded / e.total * 100)); };
      x.onload = function(){ setProg(d,100); (x.status>=200&&x.status<300)?res(x.responseText):rej(new Error('HTTP '+x.status)); };
      x.onerror = function(){ rej(new Error('network')); };
      x.send(body);
    });
  }

  function upload(file){
    if(!key){ ensureKey(); return; }
    var d = card(file.name); var t = file.type || '';
    if(t.indexOf('video/') === 0){
      fetch('/api/video/direct-upload', { method:'POST', headers: Object.assign({'content-type':'application/json'}, H()), body: JSON.stringify({meta:{name:file.name}}) })
        .then(function(r){ return r.json(); })
        .then(function(du){
          if(!du.ok){ setErr(d, du.error || 'stream error'); return; }
          var fd = new FormData(); fd.append('file', file);
          return xhrUpload(du.uploadURL, fd, d).then(function(){ setRef(d, 'video id (lesson.video)', du.uid); });
        }).catch(function(e){ setErr(d, e.message); });
    } else {
      var safe = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      var mkey = 'uploads/' + Date.now() + '-' + safe;
      xhrUpload('/api/media/' + mkey, file, d, Object.assign({'content-type': t || 'application/octet-stream'}, H()), 'PUT')
        .then(function(){
          var isImg = t.indexOf('image/') === 0;
          setRef(d, isImg ? 'image path (image field)' : 'audio key (lesson.audio)', isImg ? '/media/' + mkey : mkey);
          loadExisting();
        }).catch(function(e){ setErr(d, e.message); });
    }
  }

  function loadExisting(){
    if(!key) return;
    fetch('/api/media', { headers: H() }).then(function(r){ return r.json(); }).then(function(j){
      var ul = document.getElementById('existing'); var objs = (j && j.objects) || [];
      if(!objs.length){ ul.innerHTML = '<li class="muted">Nothing uploaded yet.</li>'; return; }
      ul.innerHTML = '';
      objs.forEach(function(o){
        var li = document.createElement('li');
        var c = document.createElement('code'); c.textContent = o.key;
        var b = document.createElement('button'); b.className='copy'; b.textContent='copy /media path';
        b.onclick = function(){ navigator.clipboard.writeText('/media/' + o.key); b.textContent='copied'; };
        li.appendChild(c); li.appendChild(b); ul.appendChild(li);
      });
    }).catch(function(){});
  }
  loadExisting();
</script>
</body></html>`;
}
