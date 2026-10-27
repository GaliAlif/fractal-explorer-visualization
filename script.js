(() => {
  "use strict";

  const canvas = document.getElementById("fractalCanvas");
  const ctx = canvas.getContext("2d", { alpha: false });
  const frame = document.getElementById("canvasFrame");
  const renderStatus = document.getElementById("renderStatus");
  const resolutionLabel = document.getElementById("resolutionLabel");
  const coordReadout = document.getElementById("coordReadout");
  const zoomReadout = document.getElementById("zoomReadout");
  const realValue = document.getElementById("realValue");
  const imagValue = document.getElementById("imagValue");
  const scaleValue = document.getElementById("scaleValue");
  const progress = document.getElementById("renderProgress");
  const progressBar = progress.querySelector("span");
  const toast = document.getElementById("toast");
  const iterationInput = document.getElementById("iterations");
  const iterationValue = document.getElementById("iterationValue");
  const paletteStrip = document.getElementById("paletteStrip");

  const palettes = {
    cosmic: { name:"Cosmic Purple", stops:[[0,"#05040a"],[.16,"#130b29"],[.42,"#7028b7"],[.68,"#d93dff"],[.86,"#5ee7ff"],[1,"#f6fbff"]] },
    electric: { name:"Electric Blue", stops:[[0,"#02060d"],[.18,"#041326"],[.43,"#075ee8"],[.7,"#19d5ff"],[.88,"#d7ffff"],[1,"#ffffff"]] },
    solar: { name:"Solar Flare", stops:[[0,"#090305"],[.18,"#17060a"],[.44,"#a8210a"],[.68,"#ff7a18"],[.87,"#ffe76a"],[1,"#fffbe2"]] },
    emerald: { name:"Emerald Abyss", stops:[[0,"#020706"],[.18,"#031512"],[.44,"#06745c"],[.7,"#20d88b"],[.88,"#b7ffd9"],[1,"#effff8"]] },
    pixel: { name:"Pixel Lime", stops:[[0,"#050706"],[.18,"#111b0c"],[.40,"#354b1c"],[.62,"#79b52b"],[.82,"#b7ff3c"],[1,"#f0ffd4"]] }
  };

  const presets = [
    { name:"Seahorse Valley", real:-0.743643887037151, imag:0.131825904205330, scale:0.018 },
    { name:"Elephant Valley", real:0.285, imag:0.01, scale:0.035 },
    { name:"Double Spiral", real:-0.101096, imag:0.956286, scale:0.042 },
    { name:"Deep Tendril", real:-0.7453, imag:0.1127, scale:0.009 }
  ];

  const DEFAULT_VIEW = { real:-0.5, imag:0, scale:3.2, palette:"cosmic", iterations:240 };
  let view = { ...DEFAULT_VIEW };
  let renderToken = 0;
  let renderQueued = false;
  let isPointerDown = false;
  let lastPointer = { x:0, y:0 };
  let pointerComplex = { real:view.real, imag:view.imag };
  let dragDistance = 0;
  let resizeObserver;

  function clamp(v,min,max){ return Math.min(max, Math.max(min,v)); }
  function finite(v){ return Number.isFinite(v); }
  function formatComplex(v){ return `${v.real.toFixed(6)} ${v.imag >= 0 ? "+" : "−"} ${Math.abs(v.imag).toFixed(6)}i`; }
  function formatZoom(){ return `${(DEFAULT_VIEW.scale / view.scale).toFixed(view.scale < 0.01 ? 2 : 2)}×`; }

  function showToast(message){
    toast.textContent = message;
    toast.classList.add("show");
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => toast.classList.remove("show"), 1900);
  }

  function updateTelemetry(){
    coordReadout.textContent = formatComplex(pointerComplex);
    zoomReadout.textContent = formatZoom();
    realValue.textContent = view.real.toFixed(6);
    imagValue.textContent = view.imag.toFixed(6);
    scaleValue.textContent = view.scale.toFixed(6);
    iterationValue.value = view.iterations;
    iterationValue.textContent = view.iterations;
    resolutionLabel.textContent = `${canvas.width} × ${canvas.height}`;
    paletteStrip.innerHTML = "";
    palettes[view.palette].stops.slice(0,6).forEach(([,color]) => {
      const s = document.createElement("span"); s.style.background = color; paletteStrip.appendChild(s);
    });
  }

  function saveState(){
    try { localStorage.setItem("fractal-explorer-state", JSON.stringify(view)); } catch {}
  }

  function validState(raw){
    if(!raw || typeof raw !== "object") return false;
    return finite(Number(raw.real)) && finite(Number(raw.imag)) && finite(Number(raw.scale)) &&
      Number(raw.scale) > 1e-8 && Number(raw.scale) <= 10 &&
      palettes[raw.palette] && Number(raw.iterations) >= 60 && Number(raw.iterations) <= 900;
  }

  function loadState(){
    try{
      const raw = JSON.parse(localStorage.getItem("fractal-explorer-state") || "null");
      if(validState(raw)){
        view = { real:Number(raw.real), imag:Number(raw.imag), scale:Number(raw.scale), palette:raw.palette, iterations:Math.round(Number(raw.iterations)/20)*20 };
      }
    }catch{ /* corrupted storage is safely ignored */ }
  }

  function readURL(){
    const p = new URLSearchParams(location.search);
    if(!p.has("x") && !p.has("y") && !p.has("s") && !p.has("p") && !p.has("i")) return;
    const candidate = {
      real:Number(p.get("x")), imag:Number(p.get("y")), scale:Number(p.get("s")),
      palette:p.get("p"), iterations:Number(p.get("i"))
    };
    if(validState(candidate)){
      view = { ...candidate, iterations:Math.round(candidate.iterations/20)*20 };
    } else showToast("Share link contains invalid parameters.");
  }

  function updateURL(){
    const p = new URLSearchParams();
    p.set("x", view.real.toFixed(12));
    p.set("y", view.imag.toFixed(12));
    p.set("s", view.scale.toPrecision(12));
    p.set("p", view.palette);
    p.set("i", String(view.iterations));
    history.replaceState(null,"",`${location.pathname}?${p.toString()}`);
  }

  function scheduleRender(){
    saveState(); updateURL(); updateTelemetry();
    if(renderQueued) return;
    renderQueued = true;
    requestAnimationFrame(() => { renderQueued=false; render(); });
  }

  function hexRGB(hex){
    const n = parseInt(hex.slice(1),16);
    return [(n>>16)&255,(n>>8)&255,n&255];
  }

  function buildGradient(){
    const stops = palettes[view.palette].stops;
    return stops.map(([t,c]) => [t,hexRGB(c)]);
  }

  function colorAt(t, gradient){
    if(t <= 0) return gradient[0][1];
    if(t >= 1) return gradient[gradient.length-1][1];
    for(let i=1;i<gradient.length;i++){
      if(t <= gradient[i][0]){
        const [t0,c0]=gradient[i-1], [t1,c1]=gradient[i];
        const u=(t-t0)/(t1-t0);
        return [c0[0]+(c1[0]-c0[0])*u,c0[1]+(c1[1]-c0[1])*u,c0[2]+(c1[2]-c0[2])*u];
      }
    }
    return gradient[gradient.length-1][1];
  }

  function render(){
    if(!canvas.width || !canvas.height) return;
    const token = ++renderToken;
    const w=canvas.width,h=canvas.height;
    const gradient=buildGradient();
    const image=ctx.createImageData(w,h);
    const data=image.data;
    const maxIter=view.iterations;
    const aspect=w/h;
    const scaleX=view.scale;
    const scaleY=view.scale/aspect;
    const left=view.real-scaleX/2;
    const top=view.imag-scaleY/2;
    const chunk=Math.max(3,Math.floor(420000/w));
    let y=0;
    renderStatus.textContent="RENDERING";
    progress.classList.add("active");
    progressBar.style.width="0%";

    function chunkRender(){
      if(token !== renderToken) return;
      const end=Math.min(h,y+chunk);
      for(let py=y;py<end;py++){
        const cy=top+(py/(h-1))*scaleY;
        for(let px=0;px<w;px++){
          const cx=left+(px/(w-1))*scaleX;
          let zx=0,zy=0,i=0,mag2=0;
          for(;i<maxIter && mag2<=4;i++){
            const nx=zx*zx-zy*zy+cx;
            zy=2*zx*zy+cy; zx=nx; mag2=zx*zx+zy*zy;
          }
          const idx=(py*w+px)*4;
          if(i===maxIter){ data[idx]=5;data[idx+1]=5;data[idx+2]=9; }
          else{
            // Smooth escape-time coloring: μ = i + 1 - log(log|z|)/log 2.
            const smooth=i+1-Math.log(Math.log(Math.sqrt(mag2)))/Math.log(2);
            const t=clamp(Math.log1p(Math.max(0,smooth))*0.21,0,1);
            const c=colorAt(t,gradient);
            data[idx]=c[0];data[idx+1]=c[1];data[idx+2]=c[2];
          }
          data[idx+3]=255;
        }
      }
      ctx.putImageData(image,0,0);
      y=end;
      progressBar.style.width=`${(y/h)*100}%`;
      if(y<h){
        requestAnimationFrame(chunkRender);
      }else{
        renderStatus.textContent="READY";
        progress.classList.remove("active");
        progressBar.style.width="0%";
      }
    }
    requestAnimationFrame(chunkRender);
  }

  function resizeCanvas(){
    const rect=frame.getBoundingClientRect();
    const dpr=Math.min(window.devicePixelRatio || 1,2);
    const w=Math.max(1,Math.floor(rect.width*dpr)), h=Math.max(1,Math.floor(rect.height*dpr));
    if(canvas.width!==w || canvas.height!==h){
      canvas.width=w;canvas.height=h;updateTelemetry();scheduleRender();
    }
  }

  function screenToComplex(clientX,clientY){
    const r=canvas.getBoundingClientRect();
    const aspect=canvas.width/canvas.height;
    const sx=view.scale, sy=view.scale/aspect;
    return { real:view.real+((clientX-r.left)/r.width-.5)*sx, imag:view.imag+((clientY-r.top)/r.height-.5)*sy };
  }

  function zoomAt(factor, clientX, clientY){
    const before=screenToComplex(clientX,clientY);
    view.scale=clamp(view.scale*factor,1e-7,10);
    const after=screenToComplex(clientX,clientY);
    view.real += before.real-after.real;
    view.imag += before.imag-after.imag;
    pointerComplex=screenToComplex(clientX,clientY);
    scheduleRender();
  }

  function zoomCenter(factor){
    const r=canvas.getBoundingClientRect();
    zoomAt(factor,r.left+r.width/2,r.top+r.height/2);
  }

  function resetView(){ view={...DEFAULT_VIEW}; pointerComplex={real:view.real,imag:view.imag}; syncPaletteButtons(); scheduleRender(); showToast("View reset."); }

  function syncPaletteButtons(){
    document.querySelectorAll(".palette-card").forEach(btn=>btn.classList.toggle("active",btn.dataset.palette===view.palette));
  }

  function randomizeView(){
    const targets=[
      {real:-0.5,imag:0,scale:3.2},
      {real:-0.743643887,imag:0.1318259,scale:0.018},
      {real:0.285,imag:0.01,scale:0.035},
      {real:-0.101096,imag:0.956286,scale:0.042},
      {real:-0.7453,imag:0.1127,scale:0.009},
      {real:-0.16,imag:1.0405,scale:0.12}
    ];
    const choices=Object.keys(palettes);
    const target=targets[Math.floor(Math.random()*targets.length)];
    view.real=target.real;view.imag=target.imag;view.scale=target.scale;
    view.palette=choices[Math.floor(Math.random()*choices.length)];
    view.iterations= [160,240,320,440,600][Math.floor(Math.random()*5)];
    iterationInput.value=view.iterations;
    pointerComplex={real:view.real,imag:view.imag};
    syncPaletteButtons();scheduleRender();showToast("New fractal configuration generated.");
  }

  function setPreset(p){
    view.real=p.real;view.imag=p.imag;view.scale=p.scale;
    pointerComplex={real:p.real,imag:p.imag};
    scheduleRender(); showToast(`Exploring ${p.name}.`);
  }

  async function copyShareLink(){
    updateURL();
    const url=location.href;
    try{
      await navigator.clipboard.writeText(url);
      showToast("Share link copied.");
    }catch{
      const ta=document.createElement("textarea");
      ta.value=url;ta.style.position="fixed";ta.style.opacity="0";
      document.body.appendChild(ta);ta.select();
      try{document.execCommand("copy");showToast("Share link copied.");}
      catch{showToast("Copy blocked — URL is ready in the address bar.");}
      ta.remove();
    }
  }

  function exportPNG(){
    const link=document.createElement("a");
    link.download=`fractal-explorer-${view.palette}.png`;
    link.href=canvas.toDataURL("image/png");
    link.click();
    showToast("PNG export started.");
  }

  function setupPresets(){
    const list=document.getElementById("presetList");
    presets.forEach(p=>{
      const b=document.createElement("button");b.className="preset";
      b.innerHTML=`<span><span class="preset-name">${p.name}</span><span class="preset-coord">${p.real.toFixed(4)} ${p.imag>=0?"+":"−"} ${Math.abs(p.imag).toFixed(4)}i</span></span><span class="arrow">→</span>`;
      b.addEventListener("click",()=>setPreset(p));list.appendChild(b);
    });
  }

  document.querySelectorAll(".palette-card").forEach(btn=>{
    btn.addEventListener("click",()=>{
      document.querySelectorAll(".palette-card").forEach(x=>x.classList.remove("active"));
      btn.classList.add("active");view.palette=btn.dataset.palette;scheduleRender();
    });
  });
  iterationInput.addEventListener("input",()=>{view.iterations=Number(iterationInput.value);updateTelemetry();});
  iterationInput.addEventListener("change",scheduleRender);
  document.getElementById("resetBtn").addEventListener("click",resetView);
  document.getElementById("randomizeBtn")?.addEventListener("click",randomizeView);
  document.getElementById("zoomInBtn").addEventListener("click",()=>zoomCenter(.55));
  document.getElementById("zoomOutBtn").addEventListener("click",()=>zoomCenter(1.8));
  document.getElementById("shareBtn").addEventListener("click",copyShareLink);
  document.getElementById("exportBtn").addEventListener("click",exportPNG);

  canvas.addEventListener("wheel",e=>{
    e.preventDefault();
    zoomAt(e.deltaY<0?.72:1/.72,e.clientX,e.clientY);
    pointerComplex=screenToComplex(e.clientX,e.clientY);updateTelemetry();
  },{passive:false});

  canvas.addEventListener("pointerdown",e=>{
    isPointerDown=true;dragDistance=0;lastPointer={x:e.clientX,y:e.clientY};
    canvas.classList.add("dragging");canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener("pointermove",e=>{
    pointerComplex=screenToComplex(e.clientX,e.clientY);
    if(isPointerDown){
      const dx=e.clientX-lastPointer.x,dy=e.clientY-lastPointer.y;
      dragDistance+=Math.abs(dx)+Math.abs(dy);
      const rect=canvas.getBoundingClientRect(), aspect=canvas.width/canvas.height;
      view.real-=dx/rect.width*view.scale;
      view.imag-=dy/rect.height*(view.scale/aspect);
      lastPointer={x:e.clientX,y:e.clientY};
      scheduleRender();
    }else updateTelemetry();
  });
  const stopPointer=()=>{isPointerDown=false;canvas.classList.remove("dragging");};
  canvas.addEventListener("pointerup",stopPointer);canvas.addEventListener("pointercancel",stopPointer);canvas.addEventListener("pointerleave",()=>{if(!isPointerDown) coordReadout.textContent=formatComplex(pointerComplex);});

  loadState();readURL();setupPresets();
  syncPaletteButtons();
  iterationInput.value=view.iterations;updateTelemetry();
  resizeObserver=new ResizeObserver(resizeCanvas);resizeObserver.observe(frame);
  window.addEventListener("resize",resizeCanvas,{passive:true});
  setTimeout(resizeCanvas,0);
})();
