const $=s=>document.querySelector(s);
const API='https://generativelanguage.googleapis.com/v1beta';
const J=(k,d)=>{try{return JSON.parse(localStorage[k])??d}catch{return d}};
const S={chats:J('lumenChats',[]),cfg:{key:'',model:'',sys:'Kamu Lumen, asisten AI yang cerdas, hangat, dan teliti. Jawab dalam bahasa yang dipakai pengguna, ringkas tapi lengkap. Gunakan markdown bila membantu.',temp:0.7,theme:'',...J('lumenCfg',{})},cur:null,imgs:[],busy:false,ctrl:null};
const save=()=>{try{localStorage.lumenChats=JSON.stringify(S.chats,(k,v)=>k==='imgs'?undefined:v);localStorage.lumenCfg=JSON.stringify(S.cfg)}catch{}};
const toast=t=>{const e=$('#toast');e.textContent=t;e.classList.add('on');clearTimeout(e._t);e._t=setTimeout(()=>e.classList.remove('on'),2400)};
const esc=s=>s.replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

/* ---------- markdown ---------- */
function md(src){
  const blocks=[];
  src=src.replace(/```(\w*)\n?([\s\S]*?)(```|$)/g,(_,l,c)=>{blocks.push(`<pre><div><span>${l||'kode'}</span><button data-copy>Salin</button></div><code>${esc(c.replace(/\n$/,''))}</code></pre>`);return `\u0000${blocks.length-1}\u0000`});
  let h=esc(src).split(/\n{2,}/).map(p=>{
    if(/^\u0000\d+\u0000$/.test(p.trim()))return p.trim();
    if(/^\s*[-*] /.test(p))return '<ul>'+p.split('\n').map(l=>`<li>${l.replace(/^\s*[-*] /,'')}</li>`).join('')+'</ul>';
    if(/^\s*\d+\. /.test(p))return '<ol>'+p.split('\n').map(l=>`<li>${l.replace(/^\s*\d+\. /,'')}</li>`).join('')+'</ol>';
    const hd=p.match(/^(#{1,4}) (.*)/);if(hd)return `<h${hd[1].length+1}>${hd[2]}</h${hd[1].length+1}>`;
    return `<p>${p.replace(/\n/g,'<br>')}</p>`}).join('');
  h=h.replace(/`([^`]+)`/g,'<code>$1</code>').replace(/\*\*([^*]+)\*\*/g,'<b>$1</b>').replace(/(^|[\s>])\*([^*\n]+)\*/g,'$1<i>$2</i>').replace(/\[([^\]]+)\]\((https?:[^)]+)\)/g,'<a href="$2" target="_blank" rel="noopener">$1</a>');
  return h.replace(/\u0000(\d+)\u0000/g,(_,i)=>blocks[i]);
}

/* ---------- ui ---------- */
function applyTheme(){const d=S.cfg.theme||(matchMedia('(prefers-color-scheme:dark)').matches?'dark':'light');document.documentElement.dataset.t=d}
function tag(){$('#modelTag').textContent=S.cfg.model?S.cfg.model:'Belum terhubung'}
function drawHist(){
  $('#hist').innerHTML=S.chats.map(c=>`<div class="h ${c.id===S.cur?'on':''}" data-id="${c.id}"><span>${esc(c.title)}</span><i data-del="${c.id}">✕</i></div>`).join('')||'<small style="color:var(--mu);padding:8px">Belum ada percakapan</small>'}
function msgEl(m){
  const d=document.createElement('div');d.className='m '+(m.r==='user'?'u':'a');
  if(m.r==='user'){d.innerHTML=(m.imgs||[]).map(i=>`<img src="data:${i.mime};base64,${i.data}">`).join('')+(m.t?`<div class="t">${esc(m.t)}</div>`:'')}
  else d.innerHTML=`<div class="t">${md(m.t)}</div><div class="act"><button data-cp>Salin</button><button data-re>Ulangi</button></div>`;
  return d}
function open(id){
  S.cur=id;const c=S.chats.find(x=>x.id===id);$('#msgs').innerHTML='';
  (c?c.m:[]).forEach(m=>$('#msgs').append(msgEl(m)));
  $('#welcome').classList.toggle('hide',!!(c&&c.m.length));drawHist();closeSide();scroll()}
function newChat(){if(S.busy)return;S.cur=null;$('#msgs').innerHTML='';$('#welcome').classList.remove('hide');drawHist();closeSide();$('#inp').focus()}
const scroll=()=>{const c=$('#chat');c.scrollTop=c.scrollHeight};
const closeSide=()=>{$('#side').classList.remove('open');$('#scrim').classList.remove('on')};
function setBusy(b){S.busy=b;const s=$('#send');s.textContent=b?'■':'↑';s.classList.toggle('stop',b)}

/* ---------- images ---------- */
function addImg(f){
  if(!f.type.startsWith('image/'))return;
  const r=new FileReader();r.onload=()=>{const im=new Image();im.onload=()=>{
    const k=Math.min(1,1600/Math.max(im.width,im.height)),c=document.createElement('canvas');
    c.width=im.width*k;c.height=im.height*k;c.getContext('2d').drawImage(im,0,0,c.width,c.height);
    S.imgs.push({mime:'image/jpeg',data:c.toDataURL('image/jpeg',.88).split(',')[1]});drawPrev()};im.src=r.result};r.readAsDataURL(f)}
function drawPrev(){$('#prev').innerHTML=S.imgs.map((i,n)=>`<div><img src="data:${i.mime};base64,${i.data}"><button data-rm="${n}">✕</button></div>`).join('')}

/* ---------- gemini ---------- */
async function connect(){
  const key=$('#key').value.trim(),st=$('#status');if(!key){st.textContent='Isi API key dulu.';return}
  st.textContent='Mencari model…';
  try{
    const r=await fetch(`${API}/models?pageSize=200&key=${key}`),j=await r.json();
    if(!r.ok)throw new Error(j.error?.message||'Key tidak valid');
    const all=j.models.filter(m=>m.supportedGenerationMethods?.includes('generateContent')).map(m=>m.name.replace('models/',''));
    const ver=n=>parseFloat((n.match(/gemini-(\d+(?:\.\d+)?)/)||[0,0])[1]);
    const flash=all.filter(n=>/flash/.test(n)&&!/image|tts|live|audio|lite|robotics|thinking/.test(n)).sort((a,b)=>ver(b)-ver(a)||(/preview|exp/.test(a)-/preview|exp/.test(b)));
    S.cfg.key=key;S.cfg.model=flash[0]||all[0];
    $('#model').innerHTML=[...new Set([...flash,...all])].map(n=>`<option ${n===S.cfg.model?'selected':''}>${n}</option>`).join('');
    st.textContent=`Terhubung ✓ Model Flash terbaru dipilih: ${S.cfg.model}`;save();tag()
  }catch(e){st.textContent='Gagal: '+e.message}}

function toContents(c){return c.m.filter(m=>m.t||m.imgs?.length).map(m=>({role:m.r==='user'?'user':'model',parts:[...(m.imgs||[]).map(i=>({inline_data:{mime_type:i.mime,data:i.data}})),{text:m.t||'(gambar)'}]}))}

async function reply(c){
  const box=msgEl({r:'ai',t:''});box.querySelector('.act').style.display='none';
  const t=box.querySelector('.t');t.innerHTML='<div class="think"><b>✦</b><span>Thinking.</span></div>';
  $('#msgs').append(box);scroll();
  let n=0;const sp=t.querySelector('span'),iv=setInterval(()=>{n=(n+1)%3;if(sp)sp.textContent='Thinking'+'.'.repeat(n+1)},420);
  S.ctrl=new AbortController();setBusy(true);let out='';
  try{
    const r=await fetch(`${API}/models/${S.cfg.model}:streamGenerateContent?alt=sse&key=${S.cfg.key}`,{method:'POST',signal:S.ctrl.signal,headers:{'Content-Type':'application/json'},
      body:JSON.stringify({contents:toContents(c),systemInstruction:{parts:[{text:S.cfg.sys}]},generationConfig:{temperature:+S.cfg.temp}})});
    if(!r.ok){const j=await r.json().catch(()=>({}));throw new Error(j.error?.message||'Error '+r.status)}
    const rd=r.body.getReader(),dec=new TextDecoder();let buf='';
    for(;;){const{done,value}=await rd.read();if(done)break;buf+=dec.decode(value,{stream:true});
      const ls=buf.split('\n');buf=ls.pop();
      for(const l of ls){if(!l.startsWith('data:'))continue;
        try{const p=JSON.parse(l.slice(5)).candidates?.[0]?.content?.parts||[];out+=p.filter(x=>!x.thought).map(x=>x.text||'').join('')}catch{}
        if(out){clearInterval(iv);t.innerHTML=md(out);t.classList.add('cur');scroll()}}}
    if(!out)out='_(Tidak ada jawaban. Coba ulangi.)_'
  }catch(e){if(e.name==='AbortError')out=out||'_(Dihentikan)_';else out=`**Gagal:** ${e.message}`}
  clearInterval(iv);t.classList.remove('cur');t.innerHTML=md(out);box.querySelector('.act').style.display='';
  c.m.push({r:'ai',t:out});save();setBusy(false);scroll()}

async function send(txt){
  if(S.busy){S.ctrl?.abort();return}
  const t=(txt??$('#inp').value).trim();if(!t&&!S.imgs.length)return;
  if(!S.cfg.key||!S.cfg.model){toast('Hubungkan API key dulu');openSet();return}
  let c=S.chats.find(x=>x.id===S.cur);
  if(!c){c={id:Date.now()+'',title:(t||'Gambar').slice(0,34),m:[]};S.chats.unshift(c);S.cur=c.id}
  const m={r:'user',t,imgs:S.imgs};c.m.push(m);S.imgs=[];drawPrev();
  $('#inp').value='';$('#inp').style.height='auto';$('#welcome').classList.add('hide');
  $('#msgs').append(msgEl(m));drawHist();save();await reply(c)}

/* ---------- settings ---------- */
function openSet(){
  $('#key').value=S.cfg.key;$('#sys').value=S.cfg.sys;$('#temp').value=S.cfg.temp;$('#tv').textContent=S.cfg.temp;
  $('#model').innerHTML=S.cfg.model?`<option>${S.cfg.model}</option>`:'';$('#modal').classList.add('on');closeSide()}

/* ---------- events ---------- */
$('#send').onclick=()=>send();
$('#inp').addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey&&innerWidth>760){e.preventDefault();send()}});
$('#inp').addEventListener('input',e=>{e.target.style.height='auto';e.target.style.height=e.target.scrollHeight+'px'});
$('#inp').addEventListener('paste',e=>[...e.clipboardData.files].forEach(addImg));
document.addEventListener('dragover',e=>e.preventDefault());
document.addEventListener('drop',e=>{e.preventDefault();[...e.dataTransfer.files].forEach(addImg)});
$('#attach').onclick=()=>$('#file').click();
$('#file').onchange=e=>{[...e.target.files].forEach(addImg);e.target.value=''};
$('#newChat').onclick=newChat;$('#openSet').onclick=openSet;
$('#menu').onclick=()=>{$('#side').classList.add('open');$('#scrim').classList.add('on')};$('#scrim').onclick=closeSide;
$('#theme').onclick=()=>{S.cfg.theme=document.documentElement.dataset.t==='dark'?'light':'dark';applyTheme();save()};
$('#conn').onclick=connect;
$('#model').onchange=e=>{S.cfg.model=e.target.value;save();tag()};
$('#temp').oninput=e=>{S.cfg.temp=e.target.value;$('#tv').textContent=e.target.value};
$('#close').onclick=()=>{S.cfg.sys=$('#sys').value;S.cfg.key=$('#key').value.trim()||S.cfg.key;save();tag();$('#modal').classList.remove('on')};
$('#modal').onclick=e=>{if(e.target.id==='modal')$('#close').click()};
$('#clear').onclick=()=>{if(confirm('Hapus semua percakapan?')){S.chats=[];save();newChat()}};
$('.chips').onclick=e=>{if(e.target.tagName==='BUTTON')send(e.target.textContent)};
$('#prev').onclick=e=>{const n=e.target.dataset.rm;if(n!=null){S.imgs.splice(n,1);drawPrev()}};
$('#hist').onclick=e=>{
  const d=e.target.dataset.del;if(d){if(S.busy)return;S.chats=S.chats.filter(c=>c.id!==d);save();S.cur===d?newChat():drawHist();return}
  const h=e.target.closest('.h');if(h&&!S.busy)open(h.dataset.id)};
$('#msgs').onclick=async e=>{
  const b=e.target,m=b.closest('.m');
  if(b.dataset.copy){await navigator.clipboard.writeText(b.closest('pre').querySelector('code').textContent);b.textContent='Tersalin ✓';setTimeout(()=>b.textContent='Salin',1500)}
  if(b.dataset.cp){await navigator.clipboard.writeText(m.querySelector('.t').innerText);toast('Tersalin')}
  if(b.dataset.re&&!S.busy){const c=S.chats.find(x=>x.id===S.cur);c.m.pop();m.remove();reply(c)}};

applyTheme();tag();drawHist();if(S.chats[0]&&0)open(S.chats[0].id);
if(!S.cfg.key)setTimeout(()=>toast('Buka Pengaturan untuk memasukkan API key'),900);
