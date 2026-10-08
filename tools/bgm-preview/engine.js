// BGM 합성 엔진 (승인본 reference.html의 악기 코드를 그대로 사용). 게임 구현 시 client/src/audio/bgm/로 TS 이식
(function(){
let ctx,master,dry,duck,rev,delIn,delay,noiseBuf,timer=null,step=0,nextT=0,prevF=null;
const NI={C:0,D:2,E:4,F:5,G:7,A:9,B:11};
function nf(n){const m=n.match(/^([A-G])(#|b)?(-?\d)$/);const st=NI[m[1]]+(m[2]=='#'?1:m[2]=='b'?-1:0);return 440*Math.pow(2,((+m[3]+1)*12+st-69)/12)}
function init(){if(ctx)return;ctx=new (window.AudioContext||window.webkitAudioContext)();
const comp=ctx.createDynamicsCompressor();comp.threshold.value=-14;comp.ratio.value=4;
master=ctx.createGain();master.gain.value=.7;master.connect(comp).connect(ctx.destination);
dry=ctx.createGain();dry.connect(master);duck=ctx.createGain();duck.connect(master);
rev=ctx.createConvolver();const len=ctx.sampleRate*3.2,ir=ctx.createBuffer(2,len,ctx.sampleRate);
for(let c=0;c<2;c++){const d=ir.getChannelData(c);for(let i=0;i<len;i++)d[i]=(Math.random()*2-1)*Math.pow(1-i/len,2.5)}
rev.buffer=ir;const rg=ctx.createGain();rg.gain.value=.55;rev.connect(rg).connect(master);
delIn=ctx.createGain();delay=ctx.createDelay(2);const fb=ctx.createGain();fb.gain.value=.36;const dl=ctx.createBiquadFilter();dl.type='lowpass';dl.frequency.value=2600;
delIn.connect(delay);delay.connect(dl).connect(fb).connect(delay);const dg=ctx.createGain();dg.gain.value=.5;dl.connect(dg).connect(master);
noiseBuf=ctx.createBuffer(1,ctx.sampleRate*4,ctx.sampleRate);const nd=noiseBuf.getChannelData(0);for(let i=0;i<nd.length;i++)nd[i]=Math.random()*2-1}
function route(n,o={}){let src=n;if(o.pan&&ctx.createStereoPanner){const p=ctx.createStereoPanner();p.pan.value=o.pan;n.connect(p);src=p}src.connect(o.duck?duck:dry);if(o.rev){const s=ctx.createGain();s.gain.value=o.rev;src.connect(s).connect(rev)}if(o.del){const s=ctx.createGain();s.gain.value=o.del;src.connect(s).connect(delIn)}}
function osc(type,f,t,d,det){const o=ctx.createOscillator();o.type=type;o.frequency.setValueAtTime(f,t);if(det)o.detune.value=det;o.start(t);o.stop(t+d+.5);return o}
function gn(t,a,v,d){const g=ctx.createGain();g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(v,t+a);g.gain.exponentialRampToValueAtTime(.0001,t+a+d);return g}
function sus(t,a,v,d,r){const g=ctx.createGain();g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(v,t+a);g.gain.setValueAtTime(v,t+Math.max(a,d-r));g.gain.linearRampToValueAtTime(0,t+d);return g}
function noise(t,d){const s=ctx.createBufferSource();s.buffer=noiseBuf;s.start(t);s.stop(t+d+.05);return s}
function filt(type,f,q){const b=ctx.createBiquadFilter();b.type=type;b.frequency.value=f;if(q)b.Q.value=q;return b}
function vib(o,t,d,rate,depth,dl){const lf=osc('sine',rate,t,d),lg=ctx.createGain();lg.gain.setValueAtTime(0,t);lg.gain.linearRampToValueAtTime(depth,t+(dl||.4));lf.connect(lg).connect(o.frequency)}
function rhodes(t,f,d,v){const c=osc('sine',f,t,d),m=osc('sine',f,t,d),mg=ctx.createGain();mg.gain.setValueAtTime(f*1.1,t);mg.gain.exponentialRampToValueAtTime(f*.04,t+.5);m.connect(mg).connect(c.frequency);const g=gn(t,.006,v,d);const tr=osc('sine',4.5,t,d),tg=ctx.createGain();tg.gain.value=v*.25;tr.connect(tg).connect(g.gain);c.connect(g);route(g,{rev:.4})}
function sub(t,f,d,v,dk){const o=osc('sine',f,t,d),g=sus(t,.02,v,d,.2);o.connect(g);route(g,{duck:dk})}
function kick(t,v,soft){const o=ctx.createOscillator();o.type='sine';o.frequency.setValueAtTime(soft?110:140,t);o.frequency.exponentialRampToValueAtTime(soft?42:40,t+.14);o.start(t);o.stop(t+.6);const g=gn(t,.002,v,soft?.4:.45);o.connect(g);route(g)}
function pump(t,sd,depth){duck.gain.cancelScheduledValues(t);duck.gain.setValueAtTime(depth||.3,t);duck.gain.linearRampToValueAtTime(1,t+sd*3)}
function snare(t,v){const n=noise(t,.2),b=filt('bandpass',1300,.7),g=gn(t,.002,v,.12);n.connect(b).connect(g);route(g,{rev:.35});const o=osc('triangle',170,t,.1),g2=gn(t,.002,v*.8,.07);o.connect(g2);route(g2)}
function bigSnare(t,v){const n=noise(t,.5),b=filt('bandpass',1100,.6),g=gn(t,.003,v,.32);n.connect(b).connect(g);route(g,{rev:.8});const o=osc('triangle',150,t,.2),g2=gn(t,.002,v*.9,.12);o.connect(g2);route(g2,{rev:.4})}
function hat(t,v,cut,pan){const n=noise(t,.2),b=filt(cut?'bandpass':'highpass',cut||7500,cut?1.5:0),g=gn(t,.001,v,.035);n.connect(b).connect(g);route(g,{pan})}
function shaker(t,v){const n=noise(t,.08),b=filt('bandpass',6500,1.2),g=gn(t,.008,v,.05);n.connect(b).connect(g);route(g,{rev:.2})}
function rim(t,v){const o=osc('triangle',820,t,.05),g=gn(t,.001,v,.035);o.connect(g);route(g,{rev:.4,del:.15})}
function tom(t,f,v){const o=ctx.createOscillator();o.type='sine';o.frequency.setValueAtTime(f,t);o.frequency.exponentialRampToValueAtTime(f*.55,t+.28);o.start(t);o.stop(t+.6);const g=gn(t,.002,v,.38);o.connect(g);const n=noise(t,.05),b=filt('lowpass',800),g2=gn(t,.001,v*.35,.03);n.connect(b).connect(g2);route(g,{rev:.55});route(g2,{rev:.3})}
function impact(t,v){const o=ctx.createOscillator();o.type='sine';o.frequency.setValueAtTime(90,t);o.frequency.exponentialRampToValueAtTime(32,t+1.2);o.start(t);o.stop(t+2);const g=gn(t,.003,v,1.8);o.connect(g);route(g,{rev:.5});const n=noise(t,1.5),b=filt('lowpass',700),g2=gn(t,.003,v*.5,1.2);n.connect(b).connect(g2);route(g2,{rev:.7})}
function riser(t,d,v,top){const n=noise(t,d),b=ctx.createBiquadFilter();b.type='bandpass';b.Q.value=3;b.frequency.setValueAtTime(250,t);b.frequency.exponentialRampToValueAtTime(top||6000,t+d);const g=ctx.createGain();g.gain.setValueAtTime(.0001,t);g.gain.exponentialRampToValueAtTime(v,t+d);g.gain.linearRampToValueAtTime(0,t+d+.02);n.connect(b).connect(g);route(g,{rev:.6})}
function wind(t,d,v){const n=noise(t,d),b=ctx.createBiquadFilter();b.type='bandpass';b.Q.value=.8;b.frequency.setValueAtTime(400,t);b.frequency.linearRampToValueAtTime(1300,t+d*.5);b.frequency.linearRampToValueAtTime(450,t+d);const g=sus(t,d*.4,v,d,d*.4);n.connect(b).connect(g);route(g,{rev:.5})}
function crk(t){const n=noise(t,.01),b=filt('highpass',3000),g=gn(t,.0005,.03+Math.random()*.03,.004);n.connect(b).connect(g);route(g)}
function glock(t,f,v){const o=osc('sine',f,t,1.3),g=gn(t,.002,v,1.2);o.connect(g);const o2=osc('sine',f*2.76,t,.4),g2=gn(t,.002,v*.3,.3);o2.connect(g2);route(g,{rev:.7,del:.3});route(g2,{rev:.5})}
function marimba(t,f,v,pan){const o=osc('sine',f,t,.6),g=gn(t,.002,v,.45);o.connect(g);const o2=osc('sine',f*4,t,.1),g2=gn(t,.001,v*.35,.05);o2.connect(g2);route(g,{rev:.35,del:.3,pan});route(g2,{rev:.2,pan})}
function softLead(t,f,d,v){const o=osc('triangle',f,t,d+.5);vib(o,t,d+.5,5,f*.005,.01);const lp=filt('lowpass',2600),g=ctx.createGain();g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(v,t+.04);g.gain.setValueAtTime(v*.75,t+d);g.gain.exponentialRampToValueAtTime(.0001,t+d+.4);o.connect(lp).connect(g);route(g,{rev:.45,del:.18})}
function flute(t,f,d,v,noGlide){const from=noGlide?f:(prevF||f);prevF=f;const o=ctx.createOscillator();o.type='sine';o.frequency.setValueAtTime(from,t);o.frequency.exponentialRampToValueAtTime(f,t+.05);o.start(t);o.stop(t+d+.5);
const o2=ctx.createOscillator();o2.type='triangle';o2.frequency.setValueAtTime(from*2,t);o2.frequency.exponentialRampToValueAtTime(f*2,t+.05);o2.start(t);o2.stop(t+d+.5);const g2=ctx.createGain();g2.gain.value=.12;
vib(o,t,d+.5,5.2,f*.008,Math.min(d,.6));
const g=ctx.createGain();g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(v,t+.07);g.gain.setValueAtTime(v*.8,t+d);g.gain.exponentialRampToValueAtTime(.0001,t+d+.35);o.connect(g);o2.connect(g2).connect(g);
const n=noise(t,d+.3),nb=filt('bandpass',f*2,4),ng=gn(t,.03,v*.5,.25);n.connect(nb).connect(ng);route(ng,{rev:.5});route(g,{rev:.6,del:.25})}
function pad(t,ns,d,v,c1,c2){ns.forEach((n,i)=>{const f=nf(n);[-14,0,14].forEach(dt=>{const o=osc('sawtooth',f,t,d,dt),lp=ctx.createBiquadFilter();lp.type='lowpass';lp.frequency.setValueAtTime(c1||1300,t);lp.frequency.linearRampToValueAtTime(c2||c1||1300,t+d);const g=sus(t,d*.3,v,d,d*.2);o.connect(lp).connect(g);route(g,{duck:1,rev:.45,pan:(i%2?.3:-.3)})})})}
function pulse(t,f,v,cut,pan){const o=osc('sawtooth',f,t,.25),o2=osc('square',f,t,.25,8),lp=ctx.createBiquadFilter();lp.type='lowpass';lp.Q.value=4;lp.frequency.setValueAtTime(cut*1.6,t);lp.frequency.exponentialRampToValueAtTime(cut*.5,t+.12);const g=gn(t,.002,v,.14);const m=ctx.createGain();m.gain.value=.5;o.connect(lp);o2.connect(m).connect(lp);lp.connect(g);route(g,{duck:1,del:.12,pan})}
function mono(t,f,d,v){const from=prevF||f;prevF=f;const g=ctx.createGain();g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(v,t+.03);g.gain.setValueAtTime(v*.85,t+d);g.gain.exponentialRampToValueAtTime(.0001,t+d+.35);
const lp=ctx.createBiquadFilter();lp.type='lowpass';lp.Q.value=2;lp.frequency.setValueAtTime(2400,t);lp.frequency.exponentialRampToValueAtTime(1300,t+.4);lp.connect(g);
[['sawtooth',-5,.45],['sawtooth',5,.45],['triangle',-1200,.5]].forEach(([ty,dt,gg])=>{const o=ctx.createOscillator();o.type=ty;o.detune.value=dt;o.frequency.setValueAtTime(from,t);o.frequency.exponentialRampToValueAtTime(f,t+.06);o.start(t);o.stop(t+d+.5);vib(o,t,d+.5,5,f*.006,Math.min(d,.5));const og=ctx.createGain();og.gain.value=gg;o.connect(og).connect(lp)});
route(g,{rev:.4,del:.22})}

// ---- 엔진: bgm.json 해석 (docs/audio.md 5장) ----
const CALL={
  rhodes:(t,e)=>e.notes.forEach((f,i)=>rhodes(t+i*(e.args.strum||0),f,e.d,e.v)),
  sub:(t,e)=>sub(t,e.f,e.d,e.v,e.args.duck?1:0),
  kick:(t,e)=>kick(t,e.v,e.args.soft?1:0),
  pump:(t,e)=>pump(t,e.sd,e.args.depth),
  snare:(t,e)=>snare(t,e.v),
  bigSnare:(t,e)=>bigSnare(t,e.v),
  hat:(t,e)=>hat(t,e.v,e.args.cut,e.pan),
  shaker:(t,e)=>shaker(t,e.v),
  rim:(t,e)=>rim(t,e.v),
  tom:(t,e)=>tom(t,e.hz,e.v),
  impact:(t,e)=>impact(t,e.v),
  riser:(t,e)=>riser(t,e.d,e.v,e.args.top),
  wind:(t,e)=>wind(t,e.d,e.v),
  crackle:(t,e)=>crk(t),
  glock:(t,e)=>glock(t,e.f,e.v),
  marimba:(t,e)=>marimba(t,e.f,e.v,e.pan),
  pad:(t,e)=>pad(t,e.names,e.d,e.v,e.args.c1,e.args.c2),
  pulse:(t,e)=>pulse(t,e.f,e.v,e.args.cut+(e.args.cutStep||0)*e.s,e.pan),
  softLead:(t,e)=>softLead(t,e.f,e.d,e.v),
  flute:(t,e)=>flute(t,e.f,e.d,e.v,e.args.noGlide?1:0),
  mono:(t,e)=>mono(t,e.f,e.d,e.v)
};
function val(x,s){
  if(x==null||typeof x=='number')return x;
  if(Array.isArray(x))return x[s];
  if('mod' in x)return s%x.mod==x.eq?x.then:x.else;
  if('seq' in x)return x.seq[s-x.from];
  if('base' in x)return x.base+(s-x.start)*x.add;
  return x;
}
function inBars(p,b){
  if(p.bars&&(b<p.bars[0]||b>p.bars[1]))return false;
  if(p.barList&&!p.barList.includes(b))return false;
  if(p.barMod&&b%p.barMod[0]!=p.barMod[1])return false;
  return true;
}
function onStep(p,s){return p.steps?p.steps.includes(s):(p.every?s%p.every[0]==p.every[1]:false)}
function compile(data,id){
  const tr=data.tracks[id];
  return {tr,
    ch:tr.chords.map(([b,n])=>({b,n:n.split(' ')})),
    mel:tr.melody.map(bar=>bar?bar.split(' ').map(x=>{const [n,s,l]=x.split(':');return{f:nf(n),s:+s,l:+l}}):[]),
    arps:data.arps,pools:Object.fromEntries(Object.entries(data.pools).map(([k,a])=>[k,a.map(nf)]))};
}
function runStep(C,b,s,t,sd,call){
  const ch=C.ch[b];
  for(const p of C.tr.parts){
    if(!inBars(p,b)||!onStep(p,s))continue;
    if(p.chance!=null&&Math.random()>=p.chance)continue;
    const mul=val(p.mul,s)??1,e={s,sd,args:p.args||{},v:val(p.v,s),pan:val(p.pan,s),hz:val(p.hz,s),d:(p.len||0)*sd};
    if(p.note=='bass')e.f=nf(ch.b)*mul;
    else if(p.note=='chord'){e.names=ch.n;e.notes=ch.n.map(n=>nf(n)*mul)}
    else if(p.note=='arp'){const a=C.arps[p.arp],i=a[(p.arpDiv?Math.floor(s/p.arpDiv):s)%a.length];e.f=nf(ch.n[i%ch.n.length])*mul}
    else if(p.note=='pick'){const pl=C.pools[p.pool];e.f=pl[Math.floor(Math.random()*pl.length)]*mul}
    call(p.inst,p.jitter?t+Math.random()*sd:t,e);
  }
  for(const n of C.mel[b])if(n.s==s)for(const L of C.tr.lead){
    if(L.bars&&(b<L.bars[0]||b>L.bars[1]))continue;
    call(L.inst,t,{s,sd,f:n.f,d:n.l*sd,v:L.v,args:L.args||{}});
  }
}
let C=null,onBar=null;
function tickE(){const tr=C.tr,sd=60/tr.bpm/4,spb=tr.stepsPerBar,tot=spb*C.ch.length;
  while(nextT<ctx.currentTime+.2){const b=Math.floor(step/spb),s=step%spb,t=nextT+(s%2==1?sd*tr.swing:0);
    runStep(C,b,s,t,sd,(name,tt,e)=>CALL[name](tt,e));
    if(s==0&&onBar){const bb=b;setTimeout(()=>onBar&&onBar(bb,C.ch.length),Math.max(0,(t-ctx.currentTime)*1000))}
    nextT+=sd;step=(step+1)%tot}}
const BGM={
  play(data,id,barCb){init();ctx.resume();BGM.stop();C=compile(data,id);onBar=barCb||null;step=0;prevF=null;
    delay.delayTime.value=60/C.tr.bpm/4*C.tr.delaySteps;nextT=ctx.currentTime+.1;timer=setInterval(tickE,25)},
  stop(){if(timer)clearInterval(timer);timer=null;onBar=null},
  setVolume(v){if(master)master.gain.value=v},
  _compile:compile,_runStep:runStep
};
if(typeof module!='undefined')module.exports=BGM;else window.BGM=BGM;
})();
