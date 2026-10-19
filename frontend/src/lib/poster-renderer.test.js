import test from "node:test";
import assert from "node:assert/strict";
import {blankFlyerProduct,blankPoster,drawPoster,flyerGrid,flyerSizes,imageTransformForBox,posterSizes,validateFlyerProducts,validatePosterRates} from "./poster-renderer.js";

test("poster prices are optional and old saved designs remain valid",()=>{
  assert.equal(validatePosterRates(blankPoster()),"");
  assert.equal(validatePosterRates({}),"");
});
test("flyers start with a print layout and retain optional offer rates",()=>{
  const flyer=blankPoster("UVPRO","flyer");
  assert.equal(flyer.name,"New flyer");
  assert.equal(flyer.size,"A4 flyer");
  assert.equal(flyer.products.length,2);
  assert.deepEqual(flyerSizes[flyer.size],[1240,1754]);
  assert.equal(validatePosterRates(flyer),"");
});
test("flyer product layouts support any selected count from 1 through 12",()=>{
  for(const count of [1,2,5,10,12]){
    const flyer={...blankPoster("UVPRO","flyer"),products:Array.from({length:count},(_,index)=>({...blankFlyerProduct(index),actualRate:String(100+index),offerRate:String(80+index)}))};
    assert.equal(validateFlyerProducts(flyer),"");
  }
  assert.notEqual(validateFlyerProducts({...blankPoster("UVPRO","flyer"),products:[]}),"");
  assert.equal(validateFlyerProducts({...blankPoster("UVPRO","flyer"),products:Array.from({length:12},(_,index)=>blankFlyerProduct(index))}),"");
  assert.notEqual(validateFlyerProducts({...blankPoster("UVPRO","flyer"),products:Array.from({length:13},(_,index)=>blankFlyerProduct(index))}),"");
  assert.notEqual(validateFlyerProducts({...blankPoster("UVPRO","flyer"),products:[{...blankFlyerProduct(0),actualRate:"100"}]}),"");
});
test("uploaded images support zoom, movement, and rotation within their frame",()=>{
  const box={x:10,y:20,w:200,h:100},image={width:400,height:200};
  const normal=imageTransformForBox(image,box,{},"cover");
  assert.deepEqual(normal,{width:200,height:100,x:110,y:70,rotation:0});
  const adjusted=imageTransformForBox(image,box,{imageZoom:150,imageX:50,imageY:-25,imageRotation:90},"cover");
  assert.equal(adjusted.width,300);
  assert.equal(adjusted.height,150);
  assert.equal(adjusted.x,150);
  assert.equal(adjusted.y,60);
  assert.ok(Math.abs(adjusted.rotation-Math.PI/2)<1e-9);
});
test("price validation rejects partial, negative, excessive and reversed prices",()=>{
  for(const values of [{actualRate:"250"},{offerRate:"199"},{actualRate:"0",offerRate:"0"},{actualRate:"250",offerRate:"251"},{actualRate:"250",offerRate:"-1"},{actualRate:"abc",offerRate:"1"},{actualRate:"250.001",offerRate:"199"},{actualRate:"100000000",offerRate:"199"}])
    assert.notEqual(validatePosterRates(values),"");
  assert.equal(validatePosterRates({actualRate:"250.50",offerRate:"199.99"}),"");
  assert.equal(validatePosterRates({actualRate:"250",offerRate:"0"}),"");
});
for(const size of Object.keys(posterSizes)) test(size+" renders both rates and crosses out only the actual rate",async()=>{
  const texts=[],lines=[];let start;
  const ctx={font:"",createLinearGradient(){return {addColorStop(){}};},fillRect(){},beginPath(){},roundRect(){},clip(){},save(){},restore(){},arc(){},fill(){},
    measureText(text){return {width:text.length*Number(this.font.match(/([\d.]+)px/)?.[1]||20)*.55};},
    fillText(text,x,y){texts.push({text,x,y});},moveTo(x,y){start={x,y};},lineTo(x,y){lines.push({start,end:{x,y}});},stroke(){}};
  const canvas={getContext:()=>ctx};
  await drawPoster(canvas,{...blankPoster(),size,actualRate:"250",offerRate:"199"});
  assert.deepEqual([canvas.width,canvas.height],posterSizes[size]);
  assert.ok(texts.some(t=>t.text==="ACTUAL RATE"));
  assert.ok(texts.some(t=>t.text==="OFFER RATE"));
  const actual=texts.find(t=>t.text==="₹250.00");
  const offer=texts.find(t=>t.text==="₹199.00");
  assert.ok(actual&&offer);
  const strike=lines.find(line=>line.start.x===actual.x&&line.start.y>actual.y&&line.start.y<actual.y+36);
  assert.ok(strike);
  assert.ok(strike.end.x<offer.x);
  assert.ok(texts.every(t=>t.y>=0&&t.y<canvas.height));
});
for(const size of Object.keys(flyerSizes)) test(size+" renders as a printable flyer",async()=>{
  const ctx={font:"",createLinearGradient(){return {addColorStop(){}};},fillRect(){},beginPath(){},roundRect(){},clip(){},save(){},restore(){},arc(){},fill(){},stroke(){},moveTo(){},lineTo(){},
    measureText(text){return {width:text.length*Number(this.font.match(/([\d.]+)px/)?.[1]||20)*.55};},fillText(){}};
  const canvas={getContext:()=>ctx};
  await drawPoster(canvas,{...blankPoster("UVPRO","flyer"),size});
  assert.deepEqual([canvas.width,canvas.height],flyerSizes[size]);
});

test("every flyer count and column request fits all cards inside the printable grid",()=>{
  for(const [w,h] of Object.values(flyerSizes))for(let count=1;count<=12;count++)for(const columns of ["auto","1","2","3","4"]){
    const g=flyerGrid({...blankPoster("TEST","flyer"),products:Array.from({length:count},(_,i)=>blankFlyerProduct(i)),columns},w,h);
    assert.ok(g.width>100&&g.height>145,`unusable product card for ${w}x${h}, ${count} products, ${columns} columns`);
    assert.ok(g.top+(g.rows-1)*(g.height+g.gap)+g.height<=g.bottom+1);
    assert.ok(g.pad+(g.columns-1)*(g.width+g.gap)+g.width<=w-g.pad+1);
    if(count===1)assert.equal(g.columns,1);
  }
});
