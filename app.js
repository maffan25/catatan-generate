"use strict";
/* ====== PENGATURAN: ubah sesuai kebutuhan ====== */
const C={brand:"keuanganku",loc:"id-ID",cur:"IDR"},K="kk.v1";
const EXP=["Makanan","Hiburan","Kesehatan","Transportasi","Tagihan","Lainnya"],INC=["Gaji","Freelance","Bonus","Isi saldo"];
const COL=["#f6c945","#ff7a7a","#9b7bff","#4f8cff","#6fe0b8","#ff9f5a"];
const BR={Visa:"linear-gradient(135deg,#b39dff,#7f6ad9)",PayPal:"linear-gradient(135deg,#7fe3c0,#e6f27c)",Mastercard:"linear-gradient(135deg,#ff9a7b,#ffc16b)",Lainnya:"linear-gradient(135deg,#6fa8ff,#8fe0ff)"};
const T={dash:"Dashboard Saya",stats:"Statistik",trx:"Transaksi",wallet:"Dompetku"};
/* ================================================ */
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
const IC={search:'<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',bell:'<path d="M6 17v-6a6 6 0 1 1 12 0v6l2 2H4zM10 21h4"/>',eye:'<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',arrow:'<path d="M7 17 17 7M8 7h9v9"/>',x:'<path d="M6 6l12 12M18 6 6 18"/>'};
const ic=n=>`<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${IC[n]}</svg>`;
const esc=s=>String(s).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const fmt=n=>new Intl.NumberFormat(C.loc,{style:"currency",currency:C.cur,maximumFractionDigits:0}).format(n);
const sh=n=>n>=1e6?(n/1e6).toFixed(1).replace(".",",")+"jt":n>=1e3?Math.round(n/1e3)+"rb":String(n);
const d0=new Date(),pad=n=>String(n).padStart(2,"0"),nid=()=>Date.now()+Math.floor(Math.random()*999);
const iso=o=>{const d=new Date(d0);d.setDate(d.getDate()-o);return d.getFullYear()+"-"+pad(d.getMonth()+1)+"-"+pad(d.getDate())};
const mkey=d=>d.getFullYear()+"-"+pad(d.getMonth()+1);
const fd=s=>new Date(s+"T00:00").toLocaleDateString(C.loc,{day:"numeric",month:"short",year:"numeric"});
const fs=s=>new Date(s+"T00:00").toLocaleDateString(C.loc,{day:"numeric",month:"short"});

function seed(){let i=0;const t=[],a=(o,name,cat,type,amt)=>amt&&t.push({id:++i,date:iso(o),name,cat,type,amt});
for(let m=0;m<5;m++){const b=m*30;
a(b+2,"Gaji bulanan","Gaji","in",5200000+m*100000);
a(b+9,"Proyek desain","Freelance","in",[900000,1400000,600000,1100000,800000][m]);
a(b+4,"Makan & kopi","Makanan","out",[620000,540000,710000,480000,590000][m]);
a(b+6,"Langganan streaming","Hiburan","out",[190000,190000,240000,190000,190000][m]);
a(b+11,"Cek dokter","Kesehatan","out",[250000,0,320000,150000,0][m]);
a(b+8,"Bensin & ojek","Transportasi","out",[410000,380000,450000,390000,420000][m]);
a(b+14,"Listrik & internet","Tagihan","out",[560000,540000,580000,550000,560000][m]);
a(b+17,"Belanja bulanan","Lainnya","out",[700000,650000,820000,600000,680000][m])}
a(0,"Kopi pagi","Makanan","out",35000);a(1,"Parkir","Transportasi","out",10000);a(5,"Bonus proyek","Bonus","in",250000);
return{name:"Aku",hide:false,tx:t,
cards:[{id:1,brand:"Mastercard",num:"5412 7512 3412 3368",name:"NAMA PEMILIK",exp:"09/28"},{id:2,brand:"PayPal",num:"4929 1530 8817 4352",name:"NAMA PEMILIK",exp:"11/27"},{id:3,brand:"Visa",num:"4156 6727 1439 6902",name:"NAMA PEMILIK",exp:"07/29"}],
subs:[{id:1,name:"iCloud",amt:15000,next:iso(-4)},{id:2,name:"Discord Nitro",amt:149000,next:iso(-9)},{id:3,name:"Telegram Premium",amt:69000,next:iso(-14)},{id:4,name:"Netflix",amt:54000,next:iso(-20)}]}}

let S;try{S=JSON.parse(localStorage.getItem(K))}catch(e){}
S=S||seed();
const M={v:"dash",mode:"m",sel:4,dm:0,mng:false,q:"",f:""};
const save=()=>{try{localStorage.setItem(K,JSON.stringify(S))}catch(e){}};
const upd=()=>{save();render()};
const sum=f=>S.tx.filter(f).reduce((a,t)=>a+t.amt,0);
const bal=()=>sum(t=>t.type=="in")-sum(t=>t.type=="out");
const pct=(a,b)=>b?Math.round((a-b)/b*100):(a?100:0);
let tm;const toast=m=>{const t=$("#toast");t.textContent=m;t.classList.add("on");clearTimeout(tm);tm=setTimeout(()=>t.classList.remove("on"),2800)};

function badge(el,p,good){el.textContent=(p>0?"+":"")+p+"%";el.classList.toggle("n",!good)}
function rBal(){const cm=iso(0).slice(0,7),net=sum(t=>t.date.slice(0,7)==cm&&t.type=="in")-sum(t=>t.date.slice(0,7)==cm&&t.type=="out");
$("#balV").textContent=S.hide?"Rp ••••••":fmt(bal());
$("#balS").textContent=(net<0?"-":"+")+fmt(Math.abs(net))+" arus bersih bulan ini";
const w=(ty,o)=>sum(t=>t.type==ty&&t.date>=iso(o+6)&&t.date<=iso(o));
const i0=w("in",0),e0=w("out",0),pi=pct(i0,w("in",7)),pe=pct(e0,w("out",7));
$("#incV").textContent=fmt(i0);$("#expV").textContent=fmt(e0);
badge($("#incB"),pi,pi>=0);badge($("#expB"),pe,pe<=0)}

function buckets(){return[4,3,2,1,0].map(o=>{if(M.mode=="m"){const d=new Date(d0.getFullYear(),d0.getMonth()-o,1),k=mkey(d);return{l:d.toLocaleDateString(C.loc,{month:"short"}),f:t=>t.date.slice(0,7)==k}}
const a=iso(o*7+6),b=iso(o*7);return{l:fs(a),f:t=>t.date>=a&&t.date<=b}})}
function rBars(){const B=buckets().map(b=>({...b,v:S.tx.filter(t=>t.type=="in"&&b.f(t)).reduce((a,t)=>a+t.amt,0)})),mx=Math.max(...B.map(b=>b.v),1);
$("#bars").innerHTML=B.map((b,i)=>`<button class="bar${i==M.sel?" on":""}" data-i="${i}" aria-label="${b.l}: ${fmt(b.v)}"><span class="col"><i style="height:${Math.max(b.v/mx*100,8)}%">${b.v?sh(b.v):""}</i></span>${b.l}</button>`).join("");
const s=B[M.sel],p=M.sel?pct(s.v,B[M.sel-1].v):0;
$("#bTip").textContent=`${s.l}: ${fmt(s.v)}${M.sel?` (${p>0?"+":""}${p}% dari periode sebelumnya)`:""}`}

function rDon(){const d=new Date(d0.getFullYear(),d0.getMonth()-M.dm,1),k=mkey(d);
$("#mon").textContent=d.toLocaleDateString(C.loc,{month:"short",year:"2-digit"});
const by=EXP.map((c,i)=>({c,col:COL[i],v:S.tx.filter(t=>t.type=="out"&&t.cat==c&&t.date.slice(0,7)==k).reduce((a,t)=>a+t.amt,0)})),
tot=by.reduce((a,x)=>a+x.v,0),R=54,L=2*Math.PI*R;let acc=0;
const seg=tot?by.filter(x=>x.v).map(x=>{const l=x.v/tot*L,s=`<circle r="${R}" cx="70" cy="70" fill="none" stroke="${x.col}" stroke-width="16" stroke-dasharray="${Math.max(l-3,1)} ${L}" stroke-dashoffset="${-acc}" transform="rotate(-90 70 70)"/>`;acc+=l;return s}).join(""):`<circle r="${R}" cx="70" cy="70" fill="none" stroke="rgba(255,255,255,.1)" stroke-width="16"/>`;
$("#don").innerHTML=`<svg viewBox="0 0 140 140" role="img" aria-label="Grafik pengeluaran per kategori">${seg}</svg><div class="ctr"><small>Total</small><b>${sh(tot)}</b></div>`;
$("#leg").innerHTML=by.map(x=>`<li><b style="background:${x.col}"></b>${x.c}<em>${tot?Math.round(x.v/tot*100):0}%</em></li>`).join("")}

const catCol=t=>t.type=="in"?"#b8e86b":COL[Math.max(EXP.indexOf(t.cat),0)];
function rList(){const trx=M.v=="trx";let a=[...S.tx].sort((x,y)=>y.date.localeCompare(x.date)||y.id-x.id);
if(trx){const q=M.q.toLowerCase();a=a.filter(t=>(!M.f||t.type==M.f)&&(t.name+" "+t.cat).toLowerCase().includes(q))}else a=a.slice(0,5);
$("#cnt").textContent=S.tx.length;$("#tools").hidden=!trx;$("#all").hidden=trx;
$("#list").innerHTML=a.map(t=>`<div class="tr"><span class="ic" style="background:${catCol(t)}">${esc(t.name[0]||"?").toUpperCase()}</span><div class="nm"><b>${esc(t.name)}</b><small>${fd(t.date)} · ${t.cat}</small></div><span class="st">Berhasil</span><span class="am ${t.type}">${t.type=="in"?"+":"-"}${fmt(t.amt)}</span>${trx?`<button class="x" data-del="${t.id}" aria-label="Hapus transaksi">${ic("x")}</button>`:""}</div>`).join("")||`<span class="em">Belum ada transaksi. Tekan “Tambah” untuk mencatat yang pertama.</span>`}

function rCards(){const vis=S.cards.slice(-4),st=$("#stack");st.style.height=(vis.length?(vis.length-1)*26+130:0)+"px";
st.innerHTML=vis.map((c,i)=>`<div class="cd" data-id="${c.id}" style="top:${i*26}px;z-index:${i};background:${BR[c.brand]||BR.Lainnya}"><span>${esc(c.brand)}</span><span>**** ${c.num.slice(-4)}</span></div>`).join("");
const c=S.cards[S.cards.length-1];$("#cc").textContent=S.cards.length;
$("#cdet").innerHTML=c?`<b>${esc(c.num)}</b><div class="row"><span>${esc(c.name)}</span><span>${esc(c.exp)}</span></div><button class="link" id="cdel" data-id="${c.id}">Hapus kartu</button>`:`<span class="em">Belum ada kartu. Tekan “Tambah”.</span>`;
$("#cdet").style.marginTop=c?"-34px":"0";$("#cdet").style.paddingTop=c?"46px":"16px"}

const sc=s=>COL[(s.name.charCodeAt(0)||0)%6];
function rSubs(){$("#sc").textContent=S.subs.length;
$("#sico").innerHTML=S.subs.map(s=>`<span class="sa" style="background:${sc(s)}" title="${esc(s.name)}">${esc(s.name[0]||"?").toUpperCase()}</span>`).join("");
$("#subs").innerHTML=[...S.subs].sort((a,b)=>a.next.localeCompare(b.next)).map(s=>`<div class="sub"><span class="sa" style="background:${sc(s)}">${esc(s.name[0]||"?").toUpperCase()}</span><div class="nm"><b>${esc(s.name)}</b><small>Berikutnya ${fs(s.next)}</small></div><b class="am">${fmt(s.amt)}</b>${M.mng?`<button class="x" data-ds="${s.id}" aria-label="Hapus langganan">${ic("x")}</button>`:""}</div>`).join("")+(M.mng?`<button class="chip add" data-m="sub">+ Tambah langganan</button>`:"");
$("#mng").textContent=M.mng?"Selesai":"Kelola"}

function render(){const v=M.v;$("#grid").dataset.v=v;
$$(".p").forEach(p=>p.hidden=!p.classList.contains(v));
$$("#nav button").forEach(b=>b.classList.toggle("on",b.dataset.v==v));
$("#title").textContent=T[v];document.title=T[v]+" · "+C.brand;$("#brand").textContent=C.brand;
$("#av").textContent=(S.name[0]||"A").toUpperCase();
rBal();rBars();rDon();rList();rCards();rSubs()}

/* ====== Modal ====== */
const opt=a=>a.map(x=>`<option>${x}</option>`).join("");
const F={
tx:["Tambah transaksi",()=>`<label>Nama<input name="name" required maxlength="40" placeholder="mis. Makan siang"></label><label>Jenis<select name="type" id="ty"><option value="out">Pengeluaran</option><option value="in">Pemasukan</option></select></label><label>Kategori<select name="cat" id="ct">${opt(EXP)}</select></label><label>Jumlah<input name="amt" type="number" min="1" required></label><label>Tanggal<input name="date" type="date" value="${iso(0)}" required></label>`],
transfer:["Transfer",()=>`<label>Penerima<input name="to" required maxlength="30"></label><label>Jumlah<input name="amt" type="number" min="1" required></label>`],
topup:["Isi saldo",()=>`<label>Jumlah<input name="amt" type="number" min="1" required></label>`],
card:["Tambah kartu",()=>`<label>Jenis kartu<select name="brand">${opt(["Visa","Mastercard","PayPal","Lainnya"])}</select></label><label>Nomor kartu<input name="num" required inputmode="numeric" pattern="[0-9 ]{16,19}" placeholder="4156 6727 1439 6902"></label><label>Nama pemilik<input name="name" required maxlength="26"></label><label>Berlaku sampai<input name="exp" required pattern="[0-9]{2}/[0-9]{2}" placeholder="07/29"></label>`],
sub:["Tambah langganan",()=>`<label>Nama layanan<input name="name" required maxlength="30"></label><label>Biaya per bulan<input name="amt" type="number" min="1" required></label><label>Tagihan berikutnya<input name="next" type="date" value="${iso(-7)}" required></label>`],
set:["Pengaturan",()=>`<label>Nama kamu<input name="name" value="${esc(S.name)}" maxlength="20"></label><div class="fa" style="justify-content:flex-start"><button type="button" class="chip" data-act="empty">Mulai dari kosong</button><button type="button" class="chip" data-act="demo">Muat data contoh</button></div>`]};
const H={
tx:f=>S.tx.push({id:nid(),date:f.date,name:f.name.trim(),cat:f.cat,type:f.type,amt:+f.amt}),
transfer:f=>{if(+f.amt>bal()){toast("Saldo tidak cukup");return false}S.tx.push({id:nid(),date:iso(0),name:"Transfer ke "+f.to.trim(),cat:"Lainnya",type:"out",amt:+f.amt});toast("Transfer berhasil")},
topup:f=>{S.tx.push({id:nid(),date:iso(0),name:"Isi saldo",cat:"Isi saldo",type:"in",amt:+f.amt});toast("Saldo bertambah")},
card:f=>S.cards.push({id:nid(),brand:f.brand,num:f.num.trim(),name:f.name.trim().toUpperCase(),exp:f.exp}),
sub:f=>S.subs.push({id:nid(),name:f.name.trim(),amt:+f.amt,next:f.next}),
set:f=>{S.name=f.name.trim()||"Aku"}};
function openM(k){const d=$("#dlg");d.dataset.k=k;
$("#frm").innerHTML=`<h3>${F[k][0]}</h3>${F[k][1]()}<div class="fa"><button type="button" class="chip" id="cx">Batal</button><button class="btn w">Simpan</button></div>`;
if(k=="tx")$("#ty").onchange=e=>{$("#ct").innerHTML=opt(e.target.value=="in"?INC:EXP)};
d.showModal()}
$("#frm").onsubmit=e=>{e.preventDefault();const k=$("#dlg").dataset.k;if(H[k](Object.fromEntries(new FormData(e.target)))===false)return;$("#dlg").close();upd()};
$("#dlg").addEventListener("click",e=>{if(e.target.id=="dlg")e.target.close()});

function exportCsv(){const r=[["Tanggal","Nama","Kategori","Jenis","Jumlah"],...S.tx.map(t=>[t.date,t.name,t.cat,t.type=="in"?"Masuk":"Keluar",t.amt])];
const csv=r.map(x=>x.map(c=>`"${String(c).replace(/"/g,'""')}"`).join(",")).join("\n"),a=document.createElement("a");
a.href=URL.createObjectURL(new Blob(["\ufeff"+csv],{type:"text/csv"}));a.download="transaksi.csv";a.click()}
function remind(){const s=[...S.subs].sort((a,b)=>a.next.localeCompare(b.next))[0];
toast(s?`Tagihan terdekat: ${s.name} ${fs(s.next)} (${fmt(s.amt)})`:"Belum ada tagihan langganan")}

document.addEventListener("click",e=>{const g=s=>e.target.closest(s);let t;
if(t=g("[data-m]"))return openM(t.dataset.m);
if(t=g("#nav button"))return location.hash=t.dataset.v;
if(t=g(".bar")){M.sel=+t.dataset.i;return rBars()}
if(t=g(".cd")){const i=S.cards.findIndex(c=>c.id==t.dataset.id);S.cards.push(S.cards.splice(i,1)[0]);return upd()}
if(t=g("[data-del]")){S.tx=S.tx.filter(x=>x.id!=t.dataset.del);return upd()}
if(t=g("[data-ds]")){S.subs=S.subs.filter(x=>x.id!=t.dataset.ds);return upd()}
if(t=g("#cdel")){S.cards=S.cards.filter(x=>x.id!=t.dataset.id);return upd()}
if(t=g("[data-act]")){if(t.dataset.act=="empty"){if(!confirm("Hapus semua transaksi, kartu, dan langganan?"))return;S.tx=[];S.cards=[];S.subs=[]}else{if(!confirm("Ganti semua data dengan data contoh?"))return;const n=S.name;S=seed();S.name=n}$("#dlg").close();return upd()}
if(g("#eye")){S.hide=!S.hide;return upd()}
if(g("#mode")){M.mode=M.mode=="m"?"w":"m";M.sel=4;$("#mode").textContent=M.mode=="m"?"Bulanan":"Mingguan";return rBars()}
if(g("#mon")){M.dm=(M.dm+1)%5;return rDon()}
if(g("#mng")){M.mng=!M.mng;return rSubs()}
if(g("#goStats"))return location.hash="stats";
if(g("#bSearch")){location.hash="trx";return setTimeout(()=>$("#q").focus(),60)}
if(g("#bBell"))return remind();
if(g("#av"))return openM("set");
if(g("#csv"))return exportCsv();
if(g("#cx"))return $("#dlg").close()});
$("#q").oninput=e=>{M.q=e.target.value;rList()};
$("#f").onchange=e=>{M.f=e.target.value;rList()};
$$("[data-ic]").forEach(el=>el.innerHTML=ic(el.dataset.ic));
window.onhashchange=()=>{const h=location.hash.slice(1);M.v=T[h]?h:"dash";render()};
window.onhashchange();
