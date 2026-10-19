import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeBusiness,intelligenceSources,sourceAllowed} from './intelligence-engine.js';
import {newPromotion} from './promotion-rules.js';
const now=new Date(2026,9,19,12);
const run=(data,options={})=>analyzeBusiness({storeId:'A',...data},{now,days:30,...options});
const item=(id,values={})=>({id,name:id,storeId:'A',stock:20,reorder:5,cost:50,sellingPrice:80,mrp:100,department:'Food',category:'Grocery',...values});
const sale=(id,date,total=100,values={})=>({id,storeId:'A',completedAt:date,total,items:[{id:'rice',name:'rice',qty:1,price:100}],...values});

test('empty sources do not create healthy scores, fake forecasts, or missing-stock alarms',()=>{
  const report=run({availableSources:['sales','inventory','expenses']});
  assert.equal(report.coverage.length,3);assert.equal(report.recordCount,0);
  assert.ok(report.coverage.every(s=>s.records===0));assert.ok(!report.insights.some(i=>i.severity==='Critical'));
  assert.equal(report.totals.grossSales,0);assert.equal('confidence' in report,false);
  assert.ok(!run({inventory:[item('unknown',{stock:undefined})]}).insights.some(i=>i.id==='stockout'));
});

test('analysis excludes other stores and data sources not authorized for this role',()=>{
  const report=run({availableSources:['sales'],sales:[sale('one','2026-10-18',100),sale('private','2026-10-18',5000,{storeId:'B'})],inventory:[item('secret',{stock:0})],expenses:[{status:'Posted',date:'2026-10-18',amount:99999}]});
  assert.equal(report.totals.grossSales,100);assert.deepEqual(report.coverage.map(s=>s.id),['sales']);
  assert.doesNotMatch(JSON.stringify(report),/secret|private|99999/);
  const finance=intelligenceSources.find(s=>s.id==='expenses');
  assert.equal(sourceAllowed(finance,['finance'],(_,view)=>view==='Vendor Payments'),false);
  assert.equal(sourceAllowed(finance,['finance'],(_,view)=>view==='Expenses'),true);
});

test('stock, pricing, and demand findings use real current stock and matching completed bills',()=>{
  const report=run({inventory:[item('rice',{stock:0,sellingPrice:110}),item('oil',{stock:2,sellingPrice:40}),item('batch',{parentProductId:'rice',stock:0})],sales:[sale('one','2026-10-18') ]});
  assert.equal(report.insights.find(i=>i.id==='stockout').rowCount,1);
  assert.equal(report.insights.find(i=>i.id==='above-mrp').rowCount,1);
  assert.equal(report.insights.find(i=>i.id==='below-cost').rowCount,1);
  assert.equal(report.insights.find(i=>i.id==='demand-stock').rowCount,1);
});

test('sales windows are bounded; cancelled/future bills and refunds are handled explicitly',()=>{
  const report=run({sales:[sale('current','2026-10-18',100),sale('void','2026-10-18',500,{status:'Cancelled'}),sale('future','2026-10-25',999),sale('old','2026-08-01',300)],refunds:[{storeId:'A',date:'2026-10-18',amount:20},{storeId:'B',date:'2026-10-18',amount:100}]});
  assert.equal(report.totals.bills,1);assert.equal(report.totals.grossSales,100);assert.equal(report.totals.refunds,20);assert.equal(report.totals.netSales,80);
  assert.equal(report.insights.find(i=>i.id==='refund-rate').severity,'Warning');
});

test('vendor balances reconcile posted purchase lines and posted payments without counting cancelled records',()=>{
  const transactions=[{id:'t1',type:'Purchase',purchaseId:'PUR-1',storeId:'A',supplier:'Supplier',invoice:'INV-1',date:'2026-10-18',total:100,quantity:1},{id:'t2',type:'Purchase',purchaseId:'PUR-1',storeId:'A',supplier:'Supplier',invoice:'INV-1',date:'2026-10-18',total:50,quantity:1},{id:'void',type:'Purchase',purchaseId:'VOID',date:'2026-10-18',status:'Reversed',total:500}];
  const report=run({transactions,vendorPayments:[{purchaseId:'PUR-1',status:'Paid',amount:40},{purchaseId:'PUR-1',status:'Pending',amount:1000}]});
  assert.equal(report.insights.find(i=>i.id==='vendor-dues').amount,110);
  assert.ok(!run({availableSources:['transactions'],transactions,vendorPayments:[{purchaseId:'PUR-1',amount:150}]}).insights.some(i=>i.id==='vendor-dues'));
});

test('financial, attendance, production, and kitchen alerts include evidence and do not change inputs',()=>{
  const data={expenses:[{status:'Posted',date:'2026-10-18',amount:200},{status:'Pending',date:'2026-10-18',amount:999}],journals:[{status:'Posted',reference:'J1',lines:[{debit:100,credit:0},{debit:0,credit:50}]}],attendance:[{employeeName:'Staff',checkIn:'2026-10-17T10:00:00'}],leaves:[{employeeName:'Staff',status:'Pending',from:'2026-10-20',to:'2026-10-21'}],batches:[{id:'B1',date:'2026-10-17',status:'In progress'}],wastage:[{date:'2026-10-18',item:'Rice',qty:1,unit:'kg',reason:'Spoiled'}],kds:[{id:'K1',status:'Preparing',createdAt:'2026-10-19T10:00:00'}]};
  const before=JSON.stringify(data),report=run(data);
  for(const id of ['expense-overview','journal-balance','attendance-open','leave-queue','production-open','wastage','kitchen-delay'])assert.ok(report.insights.some(i=>i.id===id),id);
  assert.equal(report.insights.find(i=>i.id==='expense-overview').amount,200);assert.equal(JSON.stringify(data),before);
});

test('promotion analysis checks actual availability and respects offer submenu access',()=>{
  const promo={...newPromotion('product-discounts'),name:'Special',startTime:'10:00',endTime:'14:00',status:'Active',productDiscounts:[{itemId:'rice',offerPrice:'30'}]};
  assert.ok(run({inventory:[item('rice')],offers:[promo]}).insights.some(i=>i.id==='promo-cost'));
  assert.ok(!run({inventory:[item('rice')],offers:[promo],canAccessOption:()=>false}).insights.some(i=>i.id==='promo-cost'));
  assert.ok(!run({inventory:[item('rice')],offers:[{...promo,endTime:'11:00'}]}).insights.some(i=>i.id==='promo-cost'));
});

test('draft review uses the configured limit and keeps original records intact',()=>{
  const draft={id:'D1',status:'Draft',createdAt:'2026-10-15',entry:{date:'2026-10-15',invoice:'INV'}};
  assert.ok(run({purchaseDrafts:[draft],settings:{'Purchase controls':{maximumDraftDays:1}}}).insights.some(i=>i.id==='old-drafts'));
  assert.ok(!run({purchaseDrafts:[draft],settings:{'Purchase controls':{maximumDraftDays:7}}}).insights.some(i=>i.id==='old-drafts'));
});

test('submenu restrictions also hide batch evidence and promotion source counts',()=>{
  const report=run({availableSources:['inventory','offers'],inventory:[item('master'),item('private-batch',{parentProductId:'master',expiryDate:'2026-10-01',stock:2})],offers:[{template:'coupon',name:'private coupon',status:'Active'}],canAccessOption:(module,option)=>module==='inventory'&&option==='create'});
  assert.equal(report.coverage.find(s=>s.id==='inventory').records,1);
  assert.equal(report.coverage.find(s=>s.id==='offers').records,0);
  assert.doesNotMatch(JSON.stringify(report),/private-batch|private coupon/);
});

test('closed-shift variance uses the actual closing timestamp',()=>{
  const report=run({shifts:[{id:'closed',cashierName:'Jordan',openedAt:'2026-10-18T08:00:00',closedAt:'2026-10-18T20:00:00',variance:-50},{id:'old',closedAt:'2026-01-01T20:00:00',variance:1000}]});
  const finding=report.insights.find(i=>i.id==='cash-variance');assert.equal(finding.rowCount,1);assert.equal(finding.amount,50);
});
