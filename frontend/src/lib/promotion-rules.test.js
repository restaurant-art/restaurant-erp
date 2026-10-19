import test from 'node:test';
import assert from 'node:assert/strict';
import { newPromotion, evaluatePromotion, validatePromotion, editablePromotion, promotionTemplates, promotionAvailability } from './promotion-rules.js';
const cart = [{id:'coffee',price:100,qty:6},{id:'snack',price:40,qty:3}];
const make = (template, values={}) => ({...newPromotion(template),name:'Test offer',status:'Active',discountValue:'10',startTime:'00:00',endTime:'23:59',...values});
const evalOffer = (template,values={},items=cart,context={}) => evaluatePromotion(make(template,values),items,{now:new Date(2026,9,17,12),...context});
test('new promotions are active by default so they are available in POS',()=>{
  assert.equal(newPromotion('product-discounts').status,'Active');
});
test('percentage and per-unit flat savings apply only to the chosen products',()=>{
  assert.deepEqual(evalOffer('percent',{productIds:['coffee']}).lineDiscounts,[60,0]);
  assert.equal(evalOffer('flat',{productIds:['snack'],discountValue:'50'}).amount,120);
});
test('product-wise offer rates apply a different final rate to every selected product',()=>{
  const values={productDiscounts:[{itemId:'coffee',offerPrice:'90'},{itemId:'snack',offerPrice:'20'}]};
  const result=evalOffer('product-discounts',values);
  assert.deepEqual(result.lineDiscounts,[60,60]);
  assert.equal(result.amount,120);
  assert.match(validatePromotion(make('product-discounts',{productDiscounts:[{itemId:'coffee',offerPrice:''}]})),/valid offer rate/);
});
test('both basket thresholds reject small bills and calculate rewards',()=>{
  assert.equal(evalOffer('spend-percent',{minimumOrder:'800'}).amount,0);
  assert.equal(evalOffer('spend-percent',{minimumOrder:'700'}).amount,72);
  assert.equal(evalOffer('spend-flat',{minimumOrder:'700',discountValue:'100'}).amount,100);
});
test('fixed quantity caps discounted units and checks minimum quantity',()=>{
  assert.equal(evalOffer('fixed-quantity',{productIds:['coffee'],minimumQuantity:'5',quantityCap:'2',discountValue:'20'}).amount,40);
  assert.equal(evalOffer('fixed-quantity',{minimumQuantity:'10'}).amount,0);
});
test('same-pool BOGO reserves bought units and repeats complete sets',()=>{
  assert.equal(evalOffer('bogo',{productIds:['coffee'],buyQuantity:'2',rewardQuantity:'1',discountValue:'100'}).amount,200);
  assert.equal(evalOffer('bogo',{productIds:['coffee'],buyQuantity:'6',rewardQuantity:'1',discountValue:'100'}).amount,0);
});
test('buy/get rewards only a distinct pool with available quantities',()=>{
  assert.equal(evalOffer('buy-get',{productIds:['coffee'],rewardProductIds:['snack'],buyQuantity:'2',rewardQuantity:'1',discountValue:'50'}).amount,60);
  assert.match(validatePromotion(make('buy-get',{productIds:['coffee'],rewardProductIds:['coffee']})),/separate/);
});
test('bundle repeats required ratios, caps savings to bundle items',()=>{
  const values={bundleLines:[{itemId:'coffee',quantity:'2'},{itemId:'snack',quantity:'1'}],discountValue:'50'};
  assert.equal(evalOffer('bundle',values).amount,150);
  assert.equal(evalOffer('bundle',{...values,discountValue:'9999'}).amount,720);
  assert.equal(evalOffer('bundle',values,[cart[0]]).amount,0);
});
test('tiers choose the highest qualifying threshold per product',()=>{
  assert.deepEqual(evalOffer('tier').lineDiscounts,[60,6]);
});
test('delivery reward excludes delivery from spend and requires delivery order',()=>{
  const items=[{id:'goods',qty:1,price:500},{id:'shipping',qty:1,price:50}];
  const values={productIds:['shipping'],minimumOrder:'500'};
  assert.equal(evalOffer('shipping',values,items,{orderType:'Delivery'}).amount,50);
  assert.equal(evalOffer('shipping',{...values,minimumOrder:'510'},items,{orderType:'Delivery'}).amount,0);
  assert.equal(evalOffer('shipping',values,items,{orderType:'Dine-in'}).amount,0);
});
test('first purchase requires a phone and checks equivalent phone formats in history',()=>{
  assert.equal(evalOffer('first',{},cart,{}).amount,0);
  assert.equal(evalOffer('first',{},cart,{customerMobile:'9876543210',orderHistory:[]}).amount,72);
  assert.equal(evalOffer('first',{},cart,{customerMobile:'9876543210',orderHistory:[{customerMobile:'+91 98765 43210'}]}).amount,0);
});
test('happy-hour supports overnight windows and selected weekdays',()=>{
  const late=new Date(2026,9,17,23,0), noon=new Date(2026,9,17,12,0);
  assert.equal(evalOffer('happy',{startTime:'22:00',endTime:'02:00'},cart,{now:late}).amount,72);
  assert.equal(evalOffer('happy',{startTime:'22:00',endTime:'02:00'},cart,{now:noon}).amount,0);
  assert.equal(evalOffer('percent',{runDays:['Monday']},cart,{now:late}).amount,0);
});
test('coupons and custom conditions gate rewards',()=>{
  assert.equal(evalOffer('coupon',{couponCode:'SAVE'},cart,{couponEntry:'save'}).amount,10);
  assert.equal(evalOffer('coupon',{couponCode:'SAVE'},cart,{couponEntry:'WRONG'}).amount,0);
  assert.equal(evalOffer('custom',{minimumQuantity:'10'}).amount,0);
  assert.equal(evalOffer('custom',{minimumQuantity:'9',minimumOrder:'700'}).amount,72);
});
test('invalid or inactive promotions cannot affect totals; allocations never exceed saving',()=>{
  assert.equal(evalOffer('percent',{discountValue:'101'}).amount,0);
  assert.equal(evalOffer('percent',{status:'Draft'}).amount,0);
  const items=Array.from({length:8},(_,i)=>({id:String(i),price:1,qty:1}));
  assert.equal(evalOffer('spend-flat',{minimumOrder:'1',discountValue:'0.04'},items).amount,0.04);
});
test('editing old offers preserves existing ids and product pools',()=>{
  const old={id:'old',name:'Buy/get',type:'BOGO',buyProductId:'coffee',freeProductId:'snack',discount:'Buy 1, get 1 free',status:'Active'};
  const edited=editablePromotion(old);
  assert.equal(edited.id,'old'); assert.equal(edited.template,'buy-get'); assert.equal(edited.discountValue,'100');
  assert.deepEqual(edited.productIds,['coffee']); assert.deepEqual(edited.rewardProductIds,['snack']);
});

test('every promotion type requires times and respects inclusive start/exclusive end',()=>{
  const special={
    'product-discounts':{productDiscounts:[{itemId:'coffee',offerPrice:'90'}]},
    'spend-percent':{minimumOrder:'1'},'spend-flat':{minimumOrder:'1'},
    bogo:{productIds:['coffee'],discountValue:'100'},
    'buy-get':{productIds:['coffee'],rewardProductIds:['snack'],discountValue:'100'},
    bundle:{bundleLines:[{itemId:'coffee',quantity:'1'},{itemId:'snack',quantity:'1'}]},
    shipping:{productIds:['snack'],minimumOrder:'1'},coupon:{couponCode:'SAVE'}
  };
  for(const {id} of promotionTemplates){
    const rule=make(id,{...special[id],startTime:'10:00',endTime:'12:00',startDate:'2026-10-17',endDate:'2026-10-17'});
    assert.equal(validatePromotion(rule),'',id);
    const run=now=>evaluatePromotion(rule,cart,{now,orderType:'Delivery',customerMobile:'9876543210',orderHistory:[],couponEntry:'SAVE'});
    assert.equal(run(new Date(2026,9,17,9,59)).amount,0,id+' before');
    assert.ok(run(new Date(2026,9,17,10,0)).amount>0,id+' at start');
    assert.equal(run(new Date(2026,9,17,12,0)).amount,0,id+' at end');
    assert.equal(run(new Date(2026,9,18,11,0)).amount,0,id+' after date');
    assert.match(validatePromotion({...rule,startTime:''}),/start and end times/,id);
  }
});

test('overnight schedules use their starting weekday and date',()=>{
  const rule=make('percent',{startTime:'22:00',endTime:'02:00',runDays:['Friday'],startDate:'2026-10-16',endDate:'2026-10-16'});
  assert.equal(evaluatePromotion(rule,cart,{now:new Date(2026,9,17,1)}).amount,72);
  assert.equal(evaluatePromotion(rule,cart,{now:new Date(2026,9,17,2)}).amount,0);
  assert.equal(evaluatePromotion(rule,cart,{now:new Date(2026,9,17,23)}).amount,0);
  assert.equal(evaluatePromotion(rule,cart,{now:new Date(2026,9,16,22)}).amount,72);
});

test('invalid schedules and date order are rejected; old untimed offers retain their behavior',()=>{
  for(const values of [{startTime:'24:00'},{endTime:'12:60'},{startTime:'12:00',endTime:'12:00'},{startDate:'2026-02-30'},{startDate:'2026-10-18',endDate:'2026-10-17'}])assert.notEqual(validatePromotion(make('percent',values)),'');
  const legacy={...make('percent'),scheduleVersion:undefined,startTime:'16:00',endTime:'19:00'};
  assert.equal(evaluatePromotion(legacy,cart,{now:new Date(2026,9,17,12)}).amount,72);
  assert.equal(editablePromotion(legacy).startTime,'');
  assert.equal(editablePromotion(legacy).scheduleVersion,1);
  assert.notEqual(promotionAvailability({...make('percent'),status:'Scheduled',scheduleVersion:undefined},new Date(2026,9,17,12)),'');
});
