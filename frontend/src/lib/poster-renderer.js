export const posterSizes = { square: [1080,1080], portrait: [1080,1350], landscape: [1200,628] };
export const flyerSizes = { "A4 flyer": [1240,1754], "A5 flyer": [874,1240], "DL flyer": [708,1676] };
export const creativeSizes = {...posterSizes,...flyerSizes};
export const posterTemplates = [
  {id:"forest",name:"Botanical",tag:"Fresh & organic",background:"#103e34",foreground:"#fffdf3",accent:"#e0ef9c",secondary:"#246d57"},
  {id:"cream",name:"Sunday market",tag:"Warm & welcoming",background:"#fff3df",foreground:"#542e28",accent:"#b93d34",secondary:"#f3cf9d"},
  {id:"clean",name:"Studio minimal",tag:"Clean & modern",background:"#f5f8fb",foreground:"#18354a",accent:"#246c89",secondary:"#daeaf0"},
  {id:"sunset",name:"Mango season",tag:"Bright & playful",background:"#fff1c9",foreground:"#652d18",accent:"#ce4725",secondary:"#ffc853"},
  {id:"midnight",name:"After hours",tag:"Elegant & premium",background:"#191d32",foreground:"#fff7e9",accent:"#ebc985",secondary:"#343552"},
  {id:"berry",name:"Berry pop",tag:"Bold & expressive",background:"#54223f",foreground:"#fff5f7",accent:"#ffc4d6",secondary:"#913c64"},
];
export const imageDefaults={imageZoom:100,imageX:0,imageY:0,imageRotation:0,imageBrightness:100,imageContrast:100,imageSaturation:100,imageFlip:false,imageFit:"contain"};
export const fontFamilies={modern:"Arial, sans-serif",editorial:"Georgia, serif",bold:"Impact, Arial, sans-serif"};
export function blankFlyerProduct(index=0) {
  return {id:`product-${index+1}`,name:`Product ${index+1}`,actualRate:"",offerRate:"",image:"",...imageDefaults};
}
export function blankPoster(brand="UVPRO",kind="poster") {
  const flyer=kind==="flyer";
  return {name:flyer?"New flyer":"New poster",brand,headline:flyer?"Good things.\nGreat prices.":"A little fresh.\nA lot to love.",subtitle:"Your favourites, with a little extra joy.",offer:"DISCOVER YOUR NEXT FAVOURITE",actualRate:"",offerRate:"",footer:"Visit us today • Terms apply",size:flyer?"A4 flyer":"square",template:"forest",accent:"#e0ef9c",background:"#103e34",foreground:"#fffdf3",secondary:"#246d57",backgroundStyle:"gradient",pattern:"orbits",fontFamily:"modern",headlineScale:100,textAlign:"left",layout:"editorial",columns:"auto",cardStyle:"soft",cornerRadius:24,gridGap:18,badge:"FRESH FINDS",validity:"",logo:"",backgroundImage:"",backgroundOpacity:20,image:"",...imageDefaults,imageFit:flyer?"contain":"cover",products:flyer?Array.from({length:2},(_,i)=>blankFlyerProduct(i)):[]};
}
export function validatePosterRates(poster) {
  const actual=String(poster.actualRate??"").trim(),offer=String(poster.offerRate??"").trim();
  if(!actual&&!offer)return "";
  if(!actual||!offer)return "Enter both Actual Rate and Offer Rate, or leave both blank.";
  if(![actual,offer].every(v=>/^\d+(\.\d{1,2})?$/.test(v)&&Number(v)<=99999999.99)||Number(actual)<=0)
    return "Use valid prices with up to 2 decimal places. Actual Rate must be greater than zero.";
  if(Number(offer)>Number(actual))return "Offer Rate cannot be higher than Actual Rate.";
  return "";
}
export function validateFlyerProducts(poster) {
  if(!flyerSizes[poster?.size])return "";
  const products=Array.isArray(poster.products)?poster.products:[];
  if(!products.length)return "Add at least one product to the flyer.";
  if(products.length>12)return "A flyer can contain up to 12 products on one page.";
  for(let i=0;i<products.length;i++){
    if(!String(products[i]?.name||"").trim())return `Enter the name for product ${i+1}.`;
    const error=validatePosterRates(products[i]);if(error)return `Product ${i+1}: ${error}`;
  }
  return "";
}
const money=value=>new Intl.NumberFormat("en-IN",{style:"currency",currency:"INR",maximumFractionDigits:2}).format(Number(value));
const clamp=(value,min,max)=>Math.min(max,Math.max(min,Number(value)||0));
const color=(value,fallback)=>/^#[0-9a-f]{6}$/i.test(value)?value:fallback;
const contrast=hex=>{const [r,g,b]=hex.slice(1).match(/../g).map(v=>parseInt(v,16));return r*.299+g*.587+b*.114>150?"#18372e":"#ffffff";};
const imageCache=new Map();
function loadImage(src) {
  if(imageCache.has(src))return imageCache.get(src);
  const pending=new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=()=>{imageCache.delete(src);reject(new Error("Could not read this image. Please upload it again."));};img.src=src;});
  if(imageCache.size>=40)imageCache.delete(imageCache.keys().next().value);
  imageCache.set(src,pending);return pending;
}
export function imageTransformForBox(image,box,settings={},fit="cover") {
  const base=fit==="contain"?Math.min(box.w/image.width,box.h/image.height):Math.max(box.w/image.width,box.h/image.height);
  const zoom=clamp(settings.imageZoom??100,50,300)/100;
  return {width:image.width*base*zoom,height:image.height*base*zoom,x:box.x+box.w/2+clamp(settings.imageX,-100,100)*box.w*.004,y:box.y+box.h/2+clamp(settings.imageY,-100,100)*box.h*.004,rotation:clamp(settings.imageRotation,-180,180)*Math.PI/180};
}
function rounded(ctx,x,y,w,h,r,fill,stroke) {
  ctx.beginPath();ctx.roundRect(x,y,w,h,Math.max(0,Math.min(r,w/2,h/2)));
  if(fill){ctx.fillStyle=fill;ctx.fill();}if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=1.5;ctx.stroke();}
}
function photo(ctx,bitmap,box,settings={},radius=0) {
  ctx.save();rounded(ctx,box.x,box.y,box.w,box.h,radius);ctx.clip();
  const t=imageTransformForBox(bitmap,box,settings,settings.imageFit||"contain");
  ctx.filter=`brightness(${clamp(settings.imageBrightness??100,0,200)}%) contrast(${clamp(settings.imageContrast??100,0,200)}%) saturate(${clamp(settings.imageSaturation??100,0,200)}%)`;
  ctx.translate(t.x,t.y);ctx.rotate(t.rotation);if(settings.imageFlip)ctx.scale(-1,1);
  ctx.drawImage(bitmap,-t.width/2,-t.height/2,t.width,t.height);ctx.restore();
}
function text(ctx,value,x,y,width,size,maxLines,fill,options={}) {
  const family=fontFamilies[options.fontFamily]||fontFamilies.modern,weight=options.weight||700;
  const wrap=fontSize=>{
    ctx.font=`${weight} ${fontSize}px ${family}`;const lines=[];
    for(const paragraph of String(value||"").split("\n")){
      let line="";
      for(const word of paragraph.split(/\s+/).filter(Boolean)){
        if(line&&ctx.measureText(line+" "+word).width>width){lines.push(line);line="";}
        for(const ch of (line?" ":"")+word){if(line&&ctx.measureText(line+ch).width>width){lines.push(line);line="";}line+=ch;}
      }
      if(line)lines.push(line);
    }return lines;
  };
  let lines=wrap(size);while((lines.length>maxLines||(options.maxHeight&&Math.min(maxLines,lines.length)*size*1.1>options.maxHeight))&&size>10){size-=1;lines=wrap(size);}
  ctx.fillStyle=fill;ctx.textBaseline="top";ctx.textAlign="left";
  lines.slice(0,maxLines).forEach((line,i)=>{const measured=ctx.measureText(line).width;const dx=options.align==="center"?(width-measured)/2:options.align==="right"?width-measured:0;ctx.fillText(line,x+dx,y+i*size*1.1);});
  return {size,height:Math.min(maxLines,lines.length)*size*1.1,width:lines[0]?ctx.measureText(lines[0]).width:0};
}
function pill(ctx,label,x,y,width,height,fill,ink,p={}) {
  rounded(ctx,x,y,width,height,height/2,fill);
  text(ctx,label,x+14,y+height*.26,width-28,height*.38,1,ink,{...p,align:"center"});
}
async function background(ctx,p,s,w,h) {
  ctx.fillStyle=s.background;ctx.fillRect(0,0,w,h);
  if(p.backgroundStyle==="gradient"){
    const gradient=ctx.createLinearGradient(0,0,w,h);gradient.addColorStop(0,s.background);gradient.addColorStop(1,s.secondary);ctx.fillStyle=gradient;ctx.fillRect(0,0,w,h);
  }
  if(p.backgroundImage){ctx.save();ctx.globalAlpha=clamp(p.backgroundOpacity??20,0,100)/100;photo(ctx,await loadImage(p.backgroundImage),{x:0,y:0,w,h},{imageFit:"cover"});ctx.restore();}
  ctx.save();ctx.globalAlpha=.1;ctx.fillStyle=s.accent;ctx.strokeStyle=s.accent;
  if(p.pattern==="orbits"){
    ctx.lineWidth=Math.max(2,w*.002);for(let i=0;i<4;i++){ctx.beginPath();ctx.arc(w*.93,h*.12,w*(.18+i*.045),0,Math.PI*2);ctx.stroke();}
    ctx.beginPath();ctx.arc(w*.02,h*.94,w*.27,0,Math.PI*2);ctx.fill();
  }else if(p.pattern==="dots"){
    const step=Math.max(28,w*.04);for(let x=step/2;x<w;x+=step)for(let y=step/2;y<h;y+=step){ctx.beginPath();ctx.arc(x,y,2.2,0,Math.PI*2);ctx.fill();}
  }else if(p.pattern==="stripes"){
    ctx.lineWidth=2;for(let x=-h;x<w;x+=w*.09){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x+h,h);ctx.stroke();}
  }ctx.restore();
}
async function brandLine(ctx,p,s,x,y,width,height) {
  let offset=0;
  const logoSize=height*clamp(p.logoSize??100,50,200)/100;
  if(p.logo){const logo=await loadImage(p.logo);photo(ctx,logo,{x,y:y+(height-logoSize)/2,w:logoSize,h:logoSize},{imageFit:"contain"},logoSize*.15);offset=logoSize+14;}
  const nameSize=height*.36*clamp(p.brandSize??100,50,250)/100;
  text(ctx,String(p.brand||"").toUpperCase(),x+offset,y+height*.46-nameSize/2,width-offset,nameSize,1,s.foreground);
}
export function flyerGrid(p,w,h) {
  const count=Math.max(1,Math.min(12,p.products?.length||1));
  const requested=Number(p.columns),auto=count===1?1:w<800?2:count<=6?2:3;
  // Limit rows to preserve space for each product's photo, name, and prices.
  const minColumns=Math.ceil(count/(w<800?6:5));
  const columns=Math.min(count,Math.max(minColumns,requested>=1&&requested<=4?requested:auto));
  const pad=w*.045,gap=clamp(p.gridGap??18,8,36)*w/1240,top=h*.225,bottom=h*.89;
  const rows=Math.ceil(count/columns),width=(w-pad*2-gap*(columns-1))/columns,height=(bottom-top-gap*(rows-1))/rows;
  return {columns,rows,pad,gap,top,bottom,width,height};
}
async function flyer(ctx,p,s,w,h) {
  const g=flyerGrid(p,w,h),pad=g.pad,content=w-pad*2;
  await brandLine(ctx,p,s,pad,h*.023,content*.6,h*.028);
  if(p.badge)pill(ctx,p.badge,w-pad-content*.32,h*.023,content*.32,h*.028,s.accent,contrast(s.accent));
  const headingY=h*.073,headingSize=w*.067*clamp(p.headlineScale??100,60,140)/100;
  text(ctx,p.headline,pad,headingY,content,Math.min(headingSize,h*.05),2,s.foreground,{fontFamily:p.fontFamily,align:p.textAlign,maxHeight:h*.09});
  text(ctx,p.subtitle,pad,h*.178,content,w*.021,1,s.foreground,{weight:400,align:p.textAlign});
  if(p.validity)text(ctx,p.validity,pad,h*.202,content,w*.015,1,s.accent,{align:p.textAlign});
  const products=p.products.slice(0,12),bitmaps=await Promise.all(products.map(product=>product.image?loadImage(product.image):null));
  products.forEach((product,i)=>{
    const x=pad+(i%g.columns)*(g.width+g.gap),y=g.top+Math.floor(i/g.columns)*(g.height+g.gap);
    const radius=clamp(p.cornerRadius??24,0,50)*w/1240,inner=Math.max(8,Math.min(g.width*.04,g.height*.04)),ink=p.cardStyle==="outline"?s.foreground:"#18372e";
    ctx.save();
    if(p.cardStyle==="soft"){ctx.shadowColor="#071a1825";ctx.shadowBlur=16;ctx.shadowOffsetY=5;}
    rounded(ctx,x,y,g.width,g.height,radius,p.cardStyle==="outline"?null:"#fffef9",p.cardStyle==="outline"?s.accent:null);ctx.restore();
    const nameSize=Math.max(11,Math.min(25,g.width*.075,g.height*.095)),priceSize=Math.max(18,Math.min(44,g.width*.16,g.height*.17));
    const priceBlock=String(product.actualRate??"").trim()?priceSize*1.8:0;
    const imageH=Math.max(24,g.height-inner*2-nameSize*2.2-priceBlock-12),box={x:x+inner,y:y+inner,w:g.width-inner*2,h:imageH};
    if(bitmaps[i])photo(ctx,bitmaps[i],box,product,Math.max(0,radius-inner/2));
    else{ctx.save();ctx.globalAlpha=.1;rounded(ctx,box.x,box.y,box.w,box.h,Math.max(0,radius-inner/2),s.accent);ctx.restore();text(ctx,"ADD PRODUCT PHOTO",box.x+6,box.y+box.h*.45,box.w-12,Math.min(16,g.width*.048),1,ink,{align:"center"});}
    const nameY=box.y+box.h+8;
    text(ctx,product.name,x+inner,nameY,g.width-inner*2,nameSize,2,ink,{align:p.cardStyle==="bold"?"center":"left"});
    if(priceBlock){
      const rateY=y+g.height-inner-priceBlock,original=money(product.actualRate),actualSize=Math.max(10,priceSize*.43);
      const actual=text(ctx,"MRP "+original,x+inner,rateY,g.width-inner*2,actualSize,1,ink,{weight:400});
      ctx.font=`400 ${actual.size}px ${fontFamilies.modern}`;const start=x+inner+ctx.measureText("MRP ").width;
      ctx.strokeStyle=ink;ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(start,rateY+actual.size*.5);ctx.lineTo(start+ctx.measureText(original).width,rateY+actual.size*.5);ctx.stroke();
      const offerY=rateY+actualSize*1.5;
      if(p.cardStyle==="bold")pill(ctx,money(product.offerRate),x+inner,offerY,g.width-inner*2,priceSize*1.25,s.accent,contrast(s.accent));
      else text(ctx,money(product.offerRate),x+inner,offerY,g.width-inner*2,priceSize,1,p.cardStyle==="outline"?s.accent:"#be343c");
    }
  });
  pill(ctx,p.offer,pad,h*.91,content,h*.043,s.accent,contrast(s.accent));
  text(ctx,p.footer,pad,h*.973,content,w*.016,1,s.foreground,{align:"center",weight:400});
}
async function poster(ctx,p,s,w,h) {
  const wide=w>h,pad=w*.055,content=w-pad*2,layout=p.layout||"editorial",hero=layout==="immersive",center=layout==="centered";
  const bitmap=p.image?await loadImage(p.image):null;
  if(hero&&bitmap){photo(ctx,bitmap,{x:0,y:0,w,h},{...p,imageFit:"cover"});ctx.save();ctx.globalAlpha=.72;ctx.fillStyle=s.background;ctx.fillRect(0,0,w,h);ctx.restore();}
  await brandLine(ctx,p,s,pad,h*.04,content*.7,h*.045);
  if(p.badge)pill(ctx,p.badge,w-pad-content*.29,h*.04,content*.29,h*.045,s.accent,contrast(s.accent));
  let tw=content,ty=h*.15,box;
  const frameScale=clamp(p.photoFrameSize??140,70,150)/100;
  if(wide&&!hero){
    tw=content*.48;const frameWidth=w*.385*Math.min(1.05,Math.sqrt(frameScale));
    box={x:w-pad-frameWidth,y:h*.15,w:frameWidth,h:Math.min(h*.70,h*.63*frameScale)};
  }else if(!wide&&!hero){
    const bottom=h*(String(p.actualRate??'').trim()?.735:.845);
    const frameHeight=Math.min(bottom-h*.42,h*(center?.34:.29)*frameScale);
    const frameWidth=center?Math.min(content,w*.68*Math.min(1.15,Math.sqrt(frameScale))):content;
    box={x:(w-frameWidth)/2,y:bottom-frameHeight,w:frameWidth,h:frameHeight};
  }
  if(hero){ty=h*.22;tw=wide?content*.7:content;}
  const align=center?"center":p.textAlign;
  const titleSize=(wide?w*.052:w*.075)*clamp(p.headlineScale??100,60,140)/100;
  const subtitleY=hero?h*.50:wide?h*.45:h*.35;
  text(ctx,p.headline,pad,ty,tw,titleSize,3,s.foreground,{fontFamily:p.fontFamily,align,maxHeight:subtitleY-ty-h*.025});
  const subtitleHeight=!wide&&box?Math.min(h*.055,box.y-subtitleY-h*.015):wide?h*.09:h*.055;
  text(ctx,p.subtitle,pad,subtitleY,tw,wide?w*.019:w*.024,2,s.foreground,{weight:400,align,maxHeight:subtitleHeight});
  if(box){
    ctx.save();ctx.globalAlpha=.12;rounded(ctx,box.x+10,box.y+10,box.w,box.h,clamp(p.cornerRadius??24,0,50),s.accent);ctx.restore();
    if(bitmap)photo(ctx,bitmap,box,p,clamp(p.cornerRadius??24,0,50));
    else{ctx.save();ctx.globalAlpha=.15;rounded(ctx,box.x,box.y,box.w,box.h,clamp(p.cornerRadius??24,0,50),s.accent);ctx.restore();text(ctx,"YOUR PRODUCT. THE SPOTLIGHT.",box.x+20,box.y+box.h*.47,box.w-40,w*.025,1,s.foreground,{align:"center"});}
  }
  if(String(p.actualRate??"").trim()){
    const y=wide?h*.60:h*.755,rateWidth=wide?tw:content,cw=rateWidth*.45;
    const actualLabel=text(ctx,"ACTUAL RATE",pad,y,cw,w*.015,1,s.foreground);
    const actual=text(ctx,money(p.actualRate),pad,y+w*.025,cw,w*.029,1,s.foreground);
    ctx.strokeStyle=s.foreground;ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(pad,y+w*.025+actual.size*.52);ctx.lineTo(pad+actual.width,y+w*.025+actual.size*.52);ctx.stroke();
    const gap=Math.max(actualLabel.width,actual.width)+w*.035;
    text(ctx,"OFFER RATE",pad+gap,y,rateWidth-gap,w*.015,1,s.foreground);
    text(ctx,money(p.offerRate),pad+gap,y+w*.02,rateWidth-gap,w*.043,1,s.accent);
  }
  if(p.validity)text(ctx,p.validity,pad,h*.862,content,w*.017,1,s.foreground,{align:center?"center":"left"});
  pill(ctx,p.offer,pad,h*.9,content,h*.055,s.accent,contrast(s.accent));
  text(ctx,p.footer,pad,h*.967,content,Math.min(w*.015,h*.024),1,s.foreground,{align:"center",weight:400});
}
export async function drawPoster(canvas,p,outputScale=1) {
  const error=validatePosterRates(p)||validateFlyerProducts(p);if(error)throw new Error(error);
  const [w,h]=creativeSizes[p.size]||posterSizes.square,t=posterTemplates.find(t=>t.id===p.template)||posterTemplates[0];
  const s={background:color(p.background,t.background),foreground:color(p.foreground,t.foreground),accent:color(p.accent,t.accent),secondary:color(p.secondary,t.secondary)};
  const scale=outputScale===2?2:1;
  canvas.width=w*scale;canvas.height=h*scale;const ctx=canvas.getContext("2d");if(scale!==1)ctx.scale(scale,scale);await background(ctx,p,s,w,h);
  if(flyerSizes[p.size]&&p.products?.length)await flyer(ctx,p,s,w,h);else await poster(ctx,p,s,w,h);
}
export async function preparePosterImage(file,maxDimension=1800,quality=.88) {
  if(!["image/jpeg","image/png","image/webp"].includes(file.type))throw new Error("Choose a JPG, PNG, or WebP image.");
  if(file.size>5*1024*1024)throw new Error("Choose an image smaller than 5 MB.");
  const url=URL.createObjectURL(file);
  try{
    const img=await loadImage(url),scale=Math.min(1,maxDimension/Math.max(img.width,img.height)),canvas=document.createElement("canvas");
    canvas.width=Math.round(img.width*scale);canvas.height=Math.round(img.height*scale);canvas.getContext("2d").drawImage(img,0,0,canvas.width,canvas.height);
    return canvas.toDataURL(file.type==="image/jpeg"?"image/jpeg":"image/png",quality);
  }finally{imageCache.delete(url);URL.revokeObjectURL(url);}
}
