import React,{useEffect,useId,useRef,useState} from "react";
import {ArrowDown,ArrowLeft,ArrowRight,ArrowUp,Check,Copy,Download,FlipHorizontal,ImagePlus,LayoutTemplate,Minus,Palette,Plus,Redo2,RotateCcw,Save,SlidersHorizontal,Sparkles,Trash2,Type,Undo2} from "lucide-react";
import {blankFlyerProduct,blankPoster,creativeSizes,drawPoster,flyerGrid,flyerSizes,imageDefaults,posterSizes,posterTemplates,preparePosterImage,validateFlyerProducts,validatePosterRates} from "./poster-renderer.js";
import "./poster-design.css";

function Range({label,value,min,max,suffix="",onChange}) {
  const id=useId();
  return <label className="creative-range" htmlFor={id}><span>{label}<output htmlFor={id}>{value}{suffix}</output></span><input id={id} type="range" min={min} max={max} value={value} onChange={e=>onChange(Number(e.target.value))}/></label>;
}
function Select({label,value,options,onChange}) {
  return <label className="creative-field">{label}<select aria-label={label} value={value} onChange={e=>onChange(e.target.value)}>{options.map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>;
}
function ImageAdjustmentControls({value,onChange,onReset}) {
  const nudge=(key,step)=>onChange(key,Math.max(key==="imageZoom"?50:-100,Math.min(key==="imageZoom"?300:100,Number(value[key]??(key==="imageZoom"?100:0))+step)));
  return <section className="creative-photo-controls" aria-label="Photo adjustment controls"><header><SlidersHorizontal size={14}/><strong>Photo size & position</strong></header><div className="creative-adjust-body">
    {posterSizes[value.size]&&value.layout!=="immersive"&&<><Range label="Photo frame size" min={70} max={150} value={value.photoFrameSize??140} suffix="%" onChange={v=>onChange("photoFrameSize",v)}/><small className="creative-help">Resize the photo box itself. The frame stays clear of text and prices.</small></>}
    <Select label="Image fit" value={value.imageFit||"contain"} options={[["contain","Fit whole image"],["cover","Fill frame / crop"]]} onChange={v=>onChange("imageFit",v)}/>
    <div className="creative-photo-zoom"><button type="button" aria-label="Zoom image out" onClick={()=>nudge("imageZoom",-10)} disabled={Number(value.imageZoom??100)<=50}><Minus size={16}/></button><Range label="Photo zoom" min={50} max={300} value={value.imageZoom??100} suffix="%" onChange={v=>onChange("imageZoom",v)}/><button type="button" aria-label="Zoom image in" onClick={()=>nudge("imageZoom",10)} disabled={Number(value.imageZoom??100)>=300}><Plus size={16}/></button></div>
    <div className="creative-photo-arrows" role="group" aria-label="Move image"><button type="button" aria-label="Move image left" onClick={()=>nudge("imageX",-5)}><ArrowLeft size={16}/></button><button type="button" aria-label="Move image up" onClick={()=>nudge("imageY",-5)}><ArrowUp size={16}/></button><button type="button" aria-label="Move image down" onClick={()=>nudge("imageY",5)}><ArrowDown size={16}/></button><button type="button" aria-label="Move image right" onClick={()=>nudge("imageX",5)}><ArrowRight size={16}/></button><button type="button" onClick={()=>{onChange("imageX",0);onChange("imageY",0);}}>Center</button></div>
    {[["imageX","Left / right",-100,100,0,""],["imageY","Up / down",-100,100,0,""]].map(([key,label,min,max,fallback,suffix])=><Range key={key} label={label} min={min} max={max} value={value[key]??fallback} suffix={suffix} onChange={v=>onChange(key,v)}/>)}
    <div className="creative-inline"><button type="button" aria-pressed={!!value.imageFlip} onClick={()=>onChange("imageFlip",!value.imageFlip)}><FlipHorizontal size={14}/> Flip</button><button type="button" onClick={onReset}><RotateCcw size={14}/> Reset photo</button></div>
    <details className="image-adjustments"><summary>Rotation & filters</summary><div className="creative-adjust-body">{[["imageRotation","Rotation",-180,180,0,"°"],["imageBrightness","Brightness",0,200,100,"%"],["imageContrast","Contrast",0,200,100,"%"],["imageSaturation","Saturation",0,200,100,"%"]].map(([key,label,min,max,fallback,suffix])=><Range key={key} label={label} min={min} max={max} value={value[key]??fallback} suffix={suffix} onChange={v=>onChange(key,v)}/>)}</div></details>
  </div></section>;
}
function Upload({label,image,onChange,onRemove,compact=false}) {
  return <div className={`creative-upload ${compact?"compact":""}`}>
    <label>{image?<img src={image} alt="Uploaded artwork"/>:<ImagePlus size={23}/>}<span><strong>{image?"Change ":"Add "}{label}</strong><small>PNG, JPG or WebP · up to 5 MB</small></span><input type="file" accept="image/png,image/jpeg,image/webp" aria-label={`Upload ${label}`} onChange={onChange}/></label>
    {image&&<button type="button" aria-label={`Remove ${label}`} onClick={onRemove}><Trash2 size={14}/></button>}
  </div>;
}
function CreativeDesign({storeId,brand,canManage,notify,kind="poster"}) {
  const isFlyer=kind==="flyer",label=isFlyer?"flyer":"poster",title=isFlyer?"Flyer Design":"Poster Design",sizes=isFlyer?flyerSizes:posterSizes;
  const storageKey=`uvpro-${label}-designs-${storeId}`;
  const [saved,setSaved]=useState(()=>{try{const items=JSON.parse(localStorage.getItem(storageKey)||"[]");return Array.isArray(items)?items:[];}catch{return [];}});
  const [draft,setDraft]=useState(()=>blankPoster(brand,kind)),[tab,setTab]=useState("style"),[ready,setReady]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(""),[format,setFormat]=useState("png"),[exportScale,setExportScale]=useState(1),[zoom,setZoom]=useState("fit"),[guides,setGuides]=useState(false),[revision,setRevision]=useState(0);
  const canvasRef=useRef(null),draftRef=useRef(draft),uploadVersion=useRef(0),renderVersion=useRef(0),history=useRef({past:[],future:[],group:null}),previewId=useRef(null);
  const commit=(update,group=null)=>{
    const current=draftRef.current,next=typeof update==="function"?update(current):update,h=history.current;
    if(next===current)return;
    if(!group||h.group!==group){h.past=[...h.past.slice(-29),current];}h.future=[];h.group=group;
    draftRef.current=next;setDraft(next);setReady(false);setRevision(r=>r+1);
  };
  const change=(key,value)=>commit(d=>({...d,[key]:value}),key);
  function travel(direction){const h=history.current,from=direction==="undo"?h.past:h.future,to=direction==="undo"?h.future:h.past;if(!from.length||!canManage)return;uploadVersion.current++;setBusy(false);to.push(draftRef.current);const next=from.pop();h.group=null;draftRef.current=next;setDraft(next);setReady(false);setRevision(r=>r+1);}
  useEffect(()=>{
    const version=++renderVersion.current;setReady(false);
    const timer=setTimeout(()=>{const canvas=document.createElement("canvas");drawPoster(canvas,draft).then(()=>{if(version!==renderVersion.current||!canvasRef.current)return;const preview=canvasRef.current;preview.width=canvas.width;preview.height=canvas.height;preview.getContext("2d").drawImage(canvas,0,0);previewId.current=draft;setError("");setReady(true);}).catch(e=>{if(version===renderVersion.current)setError(e.message);});},80);
    return()=>{clearTimeout(timer);renderVersion.current++;};
  },[draft]);
  useEffect(()=>()=>{uploadVersion.current++;},[]);
  const persist=next=>{try{localStorage.setItem(storageKey,JSON.stringify(next));setSaved(next);return true;}catch{setError(`Browser storage is full. Download your ${label} or remove an old saved design.`);return false;}};
  function save(){
    if(!canManage||busy)return;const current=draftRef.current;
    if(!current.name.trim()||!current.headline.trim())return setError("Enter a design name and headline.");
    const invalid=validatePosterRates(current)||validateFlyerProducts(current);if(invalid)return setError(invalid);
    const record={...current,id:current.id||crypto.randomUUID(),name:current.name.trim(),updatedAt:new Date().toISOString()};
    if(persist([record,...saved.filter(p=>p.id!==record.id)])){draftRef.current=record;setDraft(record);notify?.(`${title} saved`);}
  }
  async function download(){
    if(!ready||busy||previewId.current!==draftRef.current)return;
    setBusy(true);setError("");
    try{
      const canvas=document.createElement("canvas");await drawPoster(canvas,draftRef.current,exportScale);
      const blob=await new Promise(resolve=>canvas.toBlob(resolve,format==="jpg"?"image/jpeg":"image/png",.95));if(!blob)throw new Error(`Could not export this ${label}.`);
      const url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download=(draftRef.current.name.replace(/[^a-z0-9_-]/gi,"-")||label)+`.`+format;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
    }catch(e){setError(e.message);}finally{setBusy(false);}
  }
  async function upload(event,target,index=null){
    const file=event.target.files?.[0];event.target.value="";if(!file||!canManage)return;
    const version=++uploadVersion.current,productId=index===null?null:draftRef.current.products[index]?.id;setBusy(true);setError("");
    try{
      const image=await preparePosterImage(file,target==="logo"?600:1800);
      if(version!==uploadVersion.current)return;
      if(index===null)commit(current=>({...current,[target]:image,...(target==="image"?{...imageDefaults,imageFit:"cover"}:{})}));
      else commit(current=>({...current,products:current.products.map(p=>p.id===productId?{...p,...imageDefaults,image}:p)}));
    }catch(e){if(version===uploadVersion.current)setError(e.message);}finally{if(version===uploadVersion.current)setBusy(false);}
  }
  function load(record){
    uploadVersion.current++;setBusy(false);setError("");history.current={past:[],future:[],group:null};
    const base=blankPoster(brand,kind),theme=posterTemplates.find(t=>t.id===record.template)||posterTemplates[0];
    const next={...base,background:theme.background,foreground:theme.foreground,secondary:theme.secondary,...record,products:isFlyer?(Array.isArray(record.products)&&record.products.length?record.products.slice(0,12).map(p=>({...imageDefaults,...p,id:p.id||crypto.randomUUID()})):base.products):[]};
    draftRef.current=next;setDraft(next);setReady(false);setRevision(r=>r+1);
  }
  const changeProduct=(index,key,value)=>commit(current=>({...current,products:current.products.map((p,i)=>i===index?{...p,[key]:value}:p)}),`product-${index}-${key}`);
  const countProducts=count=>commit(current=>({...current,products:Array.from({length:count},(_,i)=>current.products[i]||{...blankFlyerProduct(i),id:crypto.randomUUID()})}));
  const moveProduct=(index,delta)=>commit(current=>{const products=[...current.products];[products[index],products[index+delta]]=[products[index+delta],products[index]];return {...current,products};});
  const tabs=[["style",Palette,"Style"],["content",Type,"Content"],["images",ImagePlus,isFlyer?"Products":"Images"],["layout",LayoutTemplate,"Layout"]];
  const [width,height]=creativeSizes[draft.size]||[1080,1080],grid=isFlyer?flyerGrid(draft,width,height):null;
  return <section className="screen poster-workspace" data-history={revision}>
    <header className="poster-heading"><div className="creative-heading-copy"><span className="creative-eyebrow"><Sparkles size={13}/> MARKETING / CREATIVE STUDIO</span><h2>{title}<span className="creative-pro-tag">Studio</span></h2><p>Make something beautiful. Make it yours.</p></div><button type="button" disabled={!canManage||busy} onClick={()=>load(blankPoster(brand,kind))}><Plus size={16}/> New {label}</button></header>
    <div className="poster-studio"><section className="poster-controls" aria-label={`${title} settings`}>
      <header className="creative-editor-heading"><div><SlidersHorizontal size={16}/><strong>Design tools</strong></div><small>Every detail, your way</small></header>
      <div className="creative-tabs" role="tablist" aria-label="Design tools">{tabs.map(([id,Icon,name])=><button id={`${kind}-tab-${id}`} type="button" role="tab" aria-selected={tab===id} aria-controls={`${kind}-tools-panel`} key={id} onClick={()=>setTab(id)}><Icon size={16}/>{name}</button>)}</div>
      <fieldset className="creative-panel" id={`${kind}-tools-panel`} role="tabpanel" aria-labelledby={`${kind}-tab-${tab}`} disabled={!canManage||busy} onBlur={event=>{if(!event.currentTarget.contains(event.relatedTarget))history.current.group=null;}}>
        {tab==="style"&&<><div className="creative-section-title"><span>01</span><div><h3>Start with a mood</h3><p>Six curated palettes. Endless possibilities.</p></div></div>
          <div className="poster-template-options">{posterTemplates.map(t=><button type="button" key={t.id} aria-pressed={draft.template===t.id} onClick={()=>commit(d=>({...d,template:t.id,accent:t.accent,background:t.background,foreground:t.foreground,secondary:t.secondary}))}><div className="creative-template-swatch" style={{background:`linear-gradient(135deg,${t.background},${t.secondary})`,color:t.foreground}}><span>Aa</span><i style={{background:t.accent}}/>{draft.template===t.id&&<Check size={14}/>}</div><strong>{t.name}</strong><small>{t.tag}</small></button>)}</div>
          <div className="creative-section-title"><span>02</span><div><h3>Your signature colors</h3><p>Fine-tune the palette to match your brand.</p></div></div>
          <div className="creative-colors">{[["background","Background"],["foreground","Text"],["accent","Accent"],["secondary","Gradient end"]].map(([key,name])=><label key={key}><input type="color" aria-label={`${name} color`} value={draft[key]} onChange={e=>change(key,e.target.value)}/><span>{name}<small>{draft[key].toUpperCase()}</small></span></label>)}</div>
          <div className="creative-two"><Select label="Background style" value={draft.backgroundStyle} options={[["solid","Solid color"],["gradient","Soft gradient"]]} onChange={v=>change("backgroundStyle",v)}/><Select label="Decorative pattern" value={draft.pattern} options={[["none","None"],["orbits","Orbit lines"],["dots","Dotted texture"],["stripes","Diagonal lines"]]} onChange={v=>change("pattern",v)}/></div>
        </>}
        {tab==="content"&&<><div className="creative-section-title"><span>01</span><div><h3>Tell your story</h3><p>Write the words your customers will remember.</p></div></div>
          {[["name","Design name",60],["brand","Business name",50],["headline","Headline",100],["subtitle","Supporting text",100],["badge","Top badge",30],["offer","Call to action",60],["validity","Offer validity / dates",70],["footer","Footer / contact details",100]].map(([key,name,max])=><label className="creative-field" key={key}>{name}{key==="headline"?<textarea rows="3" value={draft[key]} maxLength={max} onChange={e=>change(key,e.target.value)}/>:<input value={draft[key]} maxLength={max} onChange={e=>change(key,e.target.value)}/>}</label>)}
          {!isFlyer&&<><div className="creative-two">{[["actualRate","Actual rate / MRP"],["offerRate","Offer rate"]].map(([key,name])=><label className="creative-field" key={key}>{name} (₹)<input type="number" min={key==="actualRate"?"0.01":"0"} step="0.01" value={draft[key]} placeholder={key==="actualRate"?"250":"199"} onChange={e=>change(key,e.target.value)}/></label>)}</div><p className="creative-help">Enter both prices to display an offer, or leave both blank.</p></>}
        </>}
        {tab==="images"&&<><div className="creative-section-title"><span>01</span><div><h3>{isFlyer?"Build your product lineup":"Give it a focal point"}</h3><p>{isFlyer?"From one hero product to twelve great finds.":"Upload your photo, then crop, position, and refine."}</p></div></div>
          {isFlyer?<><Select label="Products per page" value={draft.products.length} options={Array.from({length:12},(_,i)=>[i+1,`${i+1} ${i===0?"product":"products"}`])} onChange={v=>countProducts(Number(v))}/><p className="creative-help">Maximum 12 on one page. Use the arrows to reorder products.</p><div className="flyer-product-list">{draft.products.map((p,i)=><details className="creative-product" key={p.id} open={draft.products.length===1||undefined}><summary><span className="creative-product-number">{String(i+1).padStart(2,"0")}</span><span>{p.name||`Product ${i+1}`}<small>{p.offerRate?`Offer ₹${p.offerRate}`:"Add photo & prices"}</small></span></summary><div className="creative-product-body"><div className="creative-inline"><button type="button" disabled={i===0} aria-label={`Move product ${i+1} up`} onClick={()=>moveProduct(i,-1)}><ArrowUp size={14}/> Up</button><button type="button" disabled={i===draft.products.length-1} aria-label={`Move product ${i+1} down`} onClick={()=>moveProduct(i,1)}><ArrowDown size={14}/> Down</button></div><label className="creative-field">Product name<input value={p.name} maxLength="60" onChange={e=>changeProduct(i,"name",e.target.value)}/></label><div className="creative-two">{[["actualRate","MRP / actual rate"],["offerRate","Offer rate"]].map(([key,name])=><label key={key} className="creative-field">{name} (₹)<input type="number" min={key==="actualRate"?"0.01":"0"} step="0.01" value={p[key]} onChange={e=>changeProduct(i,key,e.target.value)}/></label>)}</div><Upload label={`product ${i+1} photo`} image={p.image} onChange={e=>upload(e,"image",i)} onRemove={()=>changeProduct(i,"image","")}/>{p.image&&<ImageAdjustmentControls value={p} onChange={(key,v)=>changeProduct(i,key,v)} onReset={()=>commit(d=>({...d,products:d.products.map((p,j)=>j===i?{...p,...imageDefaults}:p)}))}/>}</div></details>)}</div></>:<><Upload label="product photo" image={draft.image} onChange={e=>upload(e,"image")} onRemove={()=>change("image","")}/>{draft.image&&<ImageAdjustmentControls value={draft} onChange={change} onReset={()=>commit(d=>({...d,...imageDefaults,imageFit:"cover"}))}/>}</>}
          <div className="creative-section-title"><span>02</span><div><h3>Make it unmistakably yours</h3><p>Add a logo and your own background.</p></div></div>
          <Upload label="business logo" image={draft.logo} onChange={e=>upload(e,"logo")} onRemove={()=>change("logo","")} compact/>
          {draft.logo&&<Range label="Logo size" min={50} max={200} value={draft.logoSize??100} suffix="%" onChange={v=>change("logoSize",v)}/>}
          <Range label="Business name size" min={50} max={250} value={draft.brandSize??100} suffix="%" onChange={v=>change("brandSize",v)}/>
          <Upload label="background image" image={draft.backgroundImage} onChange={e=>upload(e,"backgroundImage")} onRemove={()=>change("backgroundImage","")} compact/>
          {draft.backgroundImage&&<Range label="Background image opacity" value={draft.backgroundOpacity} min={0} max={100} suffix="%" onChange={v=>change("backgroundOpacity",v)}/>}
        </>}
        {tab==="layout"&&<><div className="creative-section-title"><span>01</span><div><h3>A layout that fits</h3><p>Set the format, then shape the details.</p></div></div>
          <Select label="Canvas size" value={draft.size} options={Object.keys(sizes).map(s=>[s,`${s[0].toUpperCase()+s.slice(1)} · ${sizes[s].join(" × ")}`])} onChange={v=>change("size",v)}/>
          {isFlyer?<><div className="creative-two"><Select label="Grid columns" value={draft.columns} options={[["auto","Automatic"],["1","1 column"],["2","2 columns"],["3","3 columns"],["4","4 columns"]]} onChange={v=>change("columns",v)}/><Select label="Product card style" value={draft.cardStyle} options={[["soft","Soft shadow"],["bold","Bold price tag"],["outline","Outline / transparent"]]} onChange={v=>change("cardStyle",v)}/></div><p className="creative-help">Current layout: {grid.columns} columns × {grid.rows} rows. Dense pages use extra columns to keep products readable.</p><Range label="Space between products" min={8} max={36} value={draft.gridGap} onChange={v=>change("gridGap",v)}/></>:<Select label="Poster layout" value={draft.layout} options={[["editorial","Editorial spotlight"],["centered","Centered showcase"],["immersive","Full-photo background"]]} onChange={v=>change("layout",v)}/>}
          <Range label="Corner rounding" min={0} max={50} value={draft.cornerRadius} onChange={v=>change("cornerRadius",v)}/>
          {!isFlyer&&draft.image&&<ImageAdjustmentControls value={draft} onChange={change} onReset={()=>commit(d=>({...d,...imageDefaults,imageFit:"cover"}))}/>}
          <div className="creative-section-title"><span>02</span><div><h3>Type with personality</h3><p>Find the right voice for your headline.</p></div></div>
          <Select label="Headline font" value={draft.fontFamily} options={[["modern","Modern sans"],["editorial","Editorial serif"],["bold","Bold display"]]} onChange={v=>change("fontFamily",v)}/>
          <Range label="Headline size" min={60} max={140} value={draft.headlineScale} suffix="%" onChange={v=>change("headlineScale",v)}/>
          <Select label="Text alignment" value={draft.textAlign} options={[["left","Align left"],["center","Center"],["right","Align right"]]} onChange={v=>change("textAlign",v)}/>
          <div className="creative-section-title"><span>03</span><div><h3>Logo & business name</h3><p>Set each size independently.</p></div></div>
          {draft.logo&&<Range label="Logo size" min={50} max={200} value={draft.logoSize??100} suffix="%" onChange={v=>change("logoSize",v)}/>}
          <Range label="Business name size" min={50} max={250} value={draft.brandSize??100} suffix="%" onChange={v=>change("brandSize",v)}/>
        </>}
      </fieldset>
    </section><section className="poster-preview-panel" aria-label={`${title} preview`}>
      <header className="creative-preview-toolbar"><div><span className="creative-live-dot"/><strong>Live canvas</strong><small>{width} × {height} px</small></div><div className="creative-inline"><button type="button" disabled={!canManage||!history.current.past.length||busy} aria-label="Undo" title="Undo" onClick={()=>travel("undo")}><Undo2 size={16}/></button><button type="button" disabled={!canManage||!history.current.future.length||busy} aria-label="Redo" title="Redo" onClick={()=>travel("redo")}><Redo2 size={16}/></button></div></header>
      <div className="creative-canvas-options"><span>{isFlyer?`${draft.products.length} products · one page`:"Ready for your next campaign"}</span><div><label>Zoom<select aria-label="Preview zoom" value={zoom} onChange={e=>setZoom(e.target.value)}><option value="fit">Fit</option><option value="100">100%</option><option value="150">150%</option></select></label><label><input type="checkbox" checked={guides} onChange={e=>setGuides(e.target.checked)}/> Guides</label></div></div>
      <div className={`poster-canvas-wrap ${zoom!=="fit"?"creative-zoomed":""}`} style={zoom!=="fit"?{"--preview-zoom":Number(zoom)/100}:undefined}><div className="creative-canvas-sheet"><canvas ref={canvasRef} aria-label={`${title} artwork preview`}/>{guides&&<div className="creative-guides" aria-hidden="true"/>}</div></div>
      <div className="creative-preview-status" role="status">{busy?"Preparing your artwork…":ready?<><Check size={13}/> All changes shown in preview</>:"Updating preview…"}</div>
      {error&&<p role="alert" className="poster-error">{error}</p>}
      <div className="creative-export-panel"><div><strong>Your design, ready to go.</strong><small>Save for later or download to share.</small></div><div className="creative-export-settings"><Select label="File format" value={format} options={[["png","PNG · best quality"],["jpg","JPG · smaller file"]]} onChange={setFormat}/><Select label="Resolution" value={exportScale} options={[[1,"Standard · 1×"],[2,"High resolution · 2×"]]} onChange={v=>setExportScale(Number(v))}/></div><div className="poster-export"><button type="button" disabled={!canManage||busy} onClick={save}><Save size={16}/> Save design</button><button type="button" className="primary-action" disabled={!ready||busy} onClick={download}><Download size={16}/> Download {format.toUpperCase()}</button></div><small className="creative-help">Export: {width*exportScale} × {height*exportScale} px. Guides are excluded.</small></div>
      <p className="poster-storage-note">Saved designs stay in this browser for this store. Download a copy to print or share. Design prices do not change POS offers.</p>
    </section></div>
    <section className="poster-saved"><header><div><span className="creative-eyebrow">YOUR COLLECTION</span><h3>Saved {label}s <small>{saved.length}</small></h3></div><span>Pick up where inspiration left off.</span></header>{!saved.length?<div className="creative-empty"><Palette size={25}/><strong>Your next great design starts here.</strong><p>Save your first {label} and find it in this collection.</p></div>:<div className="creative-saved-grid">{saved.map(p=><article key={p.id}><div className="creative-saved-art" style={{background:p.background||posterTemplates.find(t=>t.id===p.template)?.background,color:p.foreground||"#fff"}}><span>{p.brand}</span><strong>{p.headline}</strong></div><div><strong>{p.name}</strong><small>{p.size} · {new Date(p.updatedAt).toLocaleDateString()}</small><div className="creative-inline"><button type="button" onClick={()=>load(p)}>Open</button><button type="button" disabled={!canManage||busy} aria-label={`Duplicate ${p.name}`} onClick={()=>load({...p,id:undefined,name:`${p.name} copy`})}><Copy size={14}/></button><button type="button" disabled={!canManage} aria-label={`Delete ${p.name}`} onClick={()=>{if(window.confirm(`Delete this saved ${label}?`))persist(saved.filter(item=>item.id!==p.id));}}><Trash2 size={14}/></button></div></div></article>)}</div>}</section>
  </section>;
}
export function PosterDesign(props){return <CreativeDesign key={`poster-${props.storeId}`} {...props} kind="poster"/>;}
export function FlyerDesign(props){return <CreativeDesign key={`flyer-${props.storeId}`} {...props} kind="flyer"/>;}
