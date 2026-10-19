import {buildPurchasePayables} from './vendor-settlements.js';
import {promotionAvailability} from './promotion-rules.js';
import {purchaseDraftDeadline} from './purchase-drafts.js';

export const intelligenceSources=[
  {id:'sales',label:'Sales',category:'Sales',prop:'sales',rights:[['pos'],['reports'],['mis']]},
  {id:'refunds',label:'Refunds',category:'Sales',prop:'refunds',rights:[['pos'],['reports','Void and refund']]},
  {id:'voids',label:'Voided items',category:'Operations',prop:'voids',rights:[['reports','Void and refund']]},
  {id:'inventory',label:'Product Master & batches',category:'Inventory',prefix:'inventory',rights:[['inventory','create'],['inventory','variants']]},
  {id:'transactions',label:'Posted purchases',category:'Vendors',prefix:'inventory-transactions',rights:[['inventory','purchase'],['finance','Vendor Payments']]},
  {id:'purchaseDrafts',label:'Purchase approvals',category:'Vendors',prefix:'purchase-drafts',rights:[['inventory','purchase']]},
  {id:'purchaseOrders',label:'Purchase orders',category:'Vendors',prefix:'purchase-orders',rights:[['inventory','purchase-order']]},
  {id:'vendorPayments',label:'Vendor payments',category:'Payments',prefix:'finance-vendor-payments',rights:[['finance','Vendor Payments']]},
  {id:'expenses',label:'Expenses',category:'Finance',prefix:'finance-expenses',rights:[['finance','Expenses']]},
  {id:'receipts',label:'Receipts',category:'Finance',prefix:'finance-receipts',rights:[['finance','Receipts']]},
  {id:'journals',label:'Journal entries',category:'Finance',prefix:'finance-journals',rights:[['finance','Journal Entries']]},
  {id:'banks',label:'Bank accounts',category:'Finance',prefix:'finance-bank-accounts',rights:[['finance','Bank Accounts']]},
  {id:'shifts',label:'Cashier shifts',category:'Operations',prefix:'shifts',rights:[['pos'],['reports','Cashier closing']]},
  {id:'kds',label:'Kitchen orders',category:'Operations',prop:'kds',rights:[['kds']]},
  {id:'tables',label:'Table orders',category:'Operations',prop:'tables',rights:[['tables']]},
  {id:'menu',label:'Menu',category:'Merchandising',prop:'menu',rights:[['menu','items']]},
  {id:'offers',label:'Offers & promotions',category:'Promotions',prefix:'offers',rights:[['offers','Happy hour offer'],['offers','BOGO offers'],['offers','Combo discounts'],['offers','Weekend offers'],['offers','Coupons']]},
  {id:'attendance',label:'Attendance records',category:'Attendance',prefix:'attendance-logs',rights:[['attendance','Attendance Records'],['attendance','Attendance Report']]},
  {id:'leaves',label:'Leave approvals',category:'Attendance',prefix:'leave-requests',rights:[['attendance','Leave Approvals']]},
  {id:'recipes',label:'Recipes',category:'Production',prefix:'recipes',rights:[['production','Recipes']]},
  {id:'batches',label:'Production batches',category:'Production',prefix:'production-batches',rights:[['production','Batches']]},
  {id:'wastage',label:'Production wastage',category:'Production',prefix:'production-wastage',rights:[['production','Wastage']]},
  {id:'foodStock',label:'Finished food stock',category:'Production',prop:'foodStock',rights:[['item-stock'],['production','Food Stock']]},
  {id:'users',label:'User accounts',category:'Administration',prop:'users',rights:[['admin','all']]},
  {id:'settings',label:'Business settings',category:'Setup',prefix:'active-settings',object:true,rights:[['settings']]},
];
export const severityOrder={Critical:0,Warning:1,Opportunity:2,Info:3};
export function sourceAllowed(source,modules=[],canAccess=()=>true){return source.rights.some(([module,option])=>modules.includes(module)&&(!option||canAccess(module,option)));}
export const finite=value=>Number.isFinite(Number(value))?Number(value):0;
export const money=value=>new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',maximumFractionDigits:2}).format(finite(value));
const text=value=>String(value??'').trim();
const lower=value=>text(value).toLowerCase();
const has=value=>value!==''&&value!==undefined&&value!==null&&Number.isFinite(Number(value));
const sum=(rows,field)=>rows.reduce((total,row)=>total+finite(typeof field==='function'?field(row):row[field]),0);
const inactive=row=>['cancelled','canceled','deleted','reversed','void','voided','rejected','inactive'].includes(lower(row.status));
function date(value){if(!value)return null;const d=/^\d{4}-\d{2}-\d{2}$/.test(String(value))?new Date(...String(value).split('-').map((v,i)=>Number(v)-(i===1?1:0))):new Date(value);return Number.isFinite(d.getTime())?d:null;}
const timestamp=row=>date(row.completedAt||row.closedAt||row.date||row.createdAt||row.checkIn||row.startedAt||row.openedAt);
const ageDays=(value,now)=>{const d=date(value);return d?Math.floor((now-d)/86400000):null;};
const names=rows=>rows.slice(0,3).map(r=>r.name||r.item||r.supplier||r.id).join(', ');
const offerPermission=offer=>offer.template==='happy'?'Happy hour offer':['bogo','buy-get'].includes(offer.template)?'BOGO offers':offer.template==='bundle'?'Combo discounts':offer.template==='coupon'?'Coupons':'Weekend offers';
function findingTitle(title){
  if(!title.startsWith('1 '))return title;
  const nouns={products:'product',prices:'price',batches:'batch',bills:'bill',customers:'customer',purchases:'purchase',drafts:'draft',orders:'order',costs:'cost',journals:'journal',receipts:'receipt',shifts:'shift',tickets:'ticket',items:'item',offers:'offer',records:'record',requests:'request',recipes:'recipe',accounts:'account'};
  const verbs={have:'has',are:'is',exceed:'exceeds',sell:'sells',need:'needs',remain:'remains',await:'awaits',do:'does'};
  return title.replace(new RegExp('\\b('+Object.keys(nouns).join('|')+')\\b'),word=>nouns[word]).replace(new RegExp('\\b('+Object.keys(verbs).join('|')+')\\b'),word=>verbs[word]);
}

export function analyzeBusiness(input={},options={}){
  const now=date(options.now)||new Date(),days=[7,30,90].includes(Number(options.days))?Number(options.days):30;
  const start=new Date(now.getFullYear(),now.getMonth(),now.getDate()-days+1),previousStart=new Date(start);previousStart.setDate(start.getDate()-days);
  const available=new Set(input.availableSources||Object.keys(input)),sources={};
  for(const config of intelligenceSources){
    const raw=available.has(config.id)?input[config.id]:[];
    const records=config.object&&raw&&typeof raw==='object'&&!Array.isArray(raw)&&Object.keys(raw).length?[raw]:Array.isArray(raw)?raw:[];
    sources[config.id]=records.filter(row=>{
      if(!row||typeof row!=='object'||(row.storeId&&String(row.storeId)!==String(input.storeId)&&!(config.id==='users'&&row.storeId==='GLOBAL')))return false;
      if(config.id==='inventory'&&input.canAccessOption&&!input.canAccessOption('inventory',row.parentProductId?'variants':'create'))return false;
      if(config.id==='offers'&&input.canAccessOption&&!input.canAccessOption('offers',offerPermission(row)))return false;
      return true;
    });
  }
  const period=rows=>rows.filter(r=>{const d=timestamp(r);return d&&d>=start&&d<=now;});
  const previous=rows=>rows.filter(r=>{const d=timestamp(r);return d&&d>=previousStart&&d<start;});
  const live=rows=>rows.filter(r=>!inactive(r));
  const insights=[];
  const add=(id,category,severity,title,description,recommendation,sourceIds,metrics,columns,rows,action,amount=0)=>{
    if(!sourceIds.every(key=>available.has(key)))return;
    insights.push({id,category,severity,title:findingTitle(title),description,recommendation,sourceIds,metrics,columns,rows:rows.slice(0,100),rowCount:rows.length,action,amount:Math.max(0,finite(amount))});
  };
  const sales=live(sources.sales).filter(r=>!['draft','pending','unpaid'].includes(lower(r.status))),current=period(sales),prior=previous(sales);
  const refunds=period(live(sources.refunds)),gross=sum(current,'total'),refundAmount=sum(refunds,'amount'),net=gross-refundAmount,priorGross=sum(prior,'total');
  const stock=live(sources.inventory).filter(r=>!r.parentProductId),stockKnown=stock.filter(r=>has(r.stock));
  const stockRows=rows=>rows.map(r=>[r.name||r.id,`${finite(r.stock)} ${r.unit||''}`,finite(r.reorder),money(r.cost)]);
  const action=(module,view,label)=>({module,view,label});
  const inventoryAction=action('inventory','create','Review Product Master');
  const salesAction=action('reports','Daily sales','Open sales report');
  if(available.has('sales')){
    add('sales-overview','Sales','Info',`${current.length} completed bills in ${days} days`,`${money(gross)} recorded sales${available.has('refunds')?`, ${money(refundAmount)} refunds, and ${money(net)} sales after refunds`:''}. These amounts include recorded tax.`,'Review the sales report before changing staffing or buying plans. The current day may be incomplete.',['sales'],[['Recorded sales',money(gross)],['Bills',current.length],['Average bill',money(current.length?gross/current.length:0)]],['Date','Bill','Total'],current.map(r=>[r.completedAt||r.createdAt||r.date,r.orderNumber||r.id,money(r.total)]),salesAction,gross);
    if(prior.length>=5&&current.length>=5&&priorGross>0){const change=(gross-priorGross)/priorGross*100;
      if(Math.abs(change)>=10)add('sales-trend','Sales',change<0?'Warning':'Opportunity',`Recorded sales ${Math.abs(change).toFixed(1)}% ${change<0?'lower':'higher'} than the previous period`,`${money(gross)} in this ${days}-day period versus ${money(priorGross)} in the preceding ${days} days.`,'Compare opening days, item mix, and incomplete trading days before treating this change as a demand trend.',['sales'],[['Current period',money(gross)],['Previous period',money(priorGross)]],['Period','Bills','Sales'],[[`Current ${days} days`,current.length,money(gross)],[`Previous ${days} days`,prior.length,money(priorGross)]],salesAction,Math.abs(gross-priorGross));
    }
    if(gross>0&&refundAmount/gross>=.05)add('refund-rate','Sales','Warning','Refunds are at least 5% of recorded sales',`${money(refundAmount)} of refunds against ${money(gross)} of sales in the selected period.`,'Review refund reasons and linked bills; compare the same period before taking action.',['sales','refunds'],[['Refund ratio',`${(refundAmount/gross*100).toFixed(1)}%`],['Refund value',money(refundAmount)]],['Bill','Reason','Amount'],refunds.map(r=>[r.billId||r.orderNumber,r.reason,money(r.amount)]),action('reports','Void and refund','Review refunds'),refundAmount);
  }
  const zero=stockKnown.filter(r=>finite(r.stock)<=0),low=stockKnown.filter(r=>finite(r.stock)>0&&has(r.reorder)&&finite(r.reorder)>0&&finite(r.stock)<=finite(r.reorder));
  if(zero.length)add('stockout','Inventory','Critical',`${zero.length} products have no available stock`,`${names(zero)}${zero.length>3?' and more':''}.`,'Check physical stock, open purchases, and receiving before ordering or offering these products.',['inventory'],[['Out of stock',zero.length]],['Product','Stock','Reorder level','Unit cost'],stockRows(zero),inventoryAction);
  if(low.length)add('reorder','Inventory','Warning',`${low.length} products are at or below reorder level`,names(low),'Review expected demand and existing purchase orders, then replenish the required quantity.',['inventory'],[['Reorder alerts',low.length]],['Product','Stock','Reorder level','Unit cost'],stockRows(low),inventoryAction);
  const expiring=live(sources.inventory).filter(r=>finite(r.stock)>0&&(r.expiryDate||r.expiry)&&ageDays(r.expiryDate||r.expiry,now)!==null&&ageDays(r.expiryDate||r.expiry,now)>=-7);
  if(expiring.length)add('expiry','Inventory',expiring.some(r=>ageDays(r.expiryDate||r.expiry,now)>0)?'Critical':'Warning',`${expiring.length} stocked batches expired or expire within 7 days`,'Only batches with recorded expiry dates and positive stock are included.','Verify expiry and stock physically. Separate expired stock; review near-expiry batches before sale.',['inventory'],[['Batches to review',expiring.length]],['Product / batch','Expiry','Stock'],expiring.map(r=>[r.name,r.expiryDate||r.expiry,`${r.stock} ${r.unit||''}`]),action('inventory','variants','Review batches'));
  const badPrice=stock.filter(r=>has(r.mrp)&&finite(r.mrp)>0&&has(r.sellingPrice)&&finite(r.sellingPrice)>finite(r.mrp));
  if(badPrice.length)add('above-mrp','Pricing','Critical',`${badPrice.length} selling prices exceed the saved MRP`,'The current selling price is higher than the MRP saved in Product Master.','Verify the product and batch MRP, then correct the selling price before billing.',['inventory'],[['Products',badPrice.length]],['Product','MRP','Selling price'],badPrice.map(r=>[r.name,money(r.mrp),money(r.sellingPrice)]),inventoryAction);
  const loss=stock.filter(r=>has(r.cost)&&finite(r.cost)>0&&has(r.sellingPrice)&&finite(r.sellingPrice)<finite(r.cost));
  if(loss.length)add('below-cost','Pricing','Warning',`${loss.length} products sell below recorded unit cost`,'This compares the saved selling price with the saved cost; it does not estimate net profit.','Check current purchase costs, tax inclusion, and deliberate markdowns before revising prices.',['inventory'],[['Products',loss.length]],['Product','Saved cost','Selling price'],loss.map(r=>[r.name,money(r.cost),money(r.sellingPrice)]),inventoryAction);
  const demand=new Map();for(const bill of current)for(const item of Array.isArray(bill.items)?bill.items:[]){const key=String(item.id||lower(item.name));demand.set(key,(demand.get(key)||0)+Math.max(0,finite(item.qty??item.quantity)));}
  const atRisk=stockKnown.filter(r=>(demand.get(String(r.id))||demand.get(lower(r.name))||0)>0&&finite(r.stock)<=finite(r.reorder));
  if(atRisk.length)add('demand-stock','Inventory','Warning','Recently sold products also need stock attention','These products appear in completed bills and are now at or below their reorder level.','Prioritize a stock check and review existing purchase orders. Recent sales do not guarantee future demand.',['sales','inventory'],[['Products with demand',atRisk.length]],['Product','Units sold in period','Stock'],atRisk.map(r=>[r.name,demand.get(String(r.id))||demand.get(lower(r.name)),`${r.stock} ${r.unit||''}`]),inventoryAction);
  const quiet=stockKnown.filter(r=>finite(r.stock)>0&&!(demand.get(String(r.id))||demand.get(lower(r.name))));
  if(current.length>=10&&quiet.length)add('quiet-stock','Merchandising','Opportunity',`${quiet.length} stocked products have no matched sales in this period`,'Sales are matched by product ID or exact product name. Unmatched or renamed products may need manual review.','Check display visibility, barcode matching, and demand before choosing a promotion.',['sales','inventory'],[['Products to review',quiet.length]],['Product','Stock','Recorded stock cost'],quiet.map(r=>[r.name,`${r.stock} ${r.unit||''}`,money(finite(r.stock)*finite(r.cost))]),inventoryAction,sum(quiet,r=>finite(r.stock)*finite(r.cost)));
  if(available.has('sales')&&input.customerAccess){
    const customers=new Map();for(const bill of sales){const key=text(bill.customerMobile).replace(/\D/g,'');if(key.length<10)continue;const d=timestamp(bill);if(!d||d>now)continue;const old=customers.get(key);if(!old||d>old.last)customers.set(key,{last:d,name:bill.customerName||`Customer ending ${key.slice(-4)}`,count:(old?.count||0)+1});else old.count++;}
    const dormant=[...customers.values()].filter(c=>c.count>=2&&ageDays(c.last,now)>=30);
    if(dormant.length)add('customer-return','Customers','Opportunity',`${dormant.length} repeat customers have not purchased for 30+ days`,'This uses customers with at least two recorded bills and a usable mobile number.','Review customer preferences and consent before planning a return-visit offer.',['sales'],[['Repeat customers to review',dormant.length]],['Customer','Last recorded visit','Recorded bills'],dormant.map(c=>[c.name,c.last.toLocaleDateString('en-IN'),c.count]),action('crm',null,'Open CRM'));
  }
  const transactions=live(sources.transactions),purchases=buildPurchasePayables(transactions,live(sources.vendorPayments));
  if(available.has('vendorPayments')){
    const unpaid=purchases.filter(p=>p.balance>.005);
    if(unpaid.length)add('vendor-dues','Payments','Warning',`${unpaid.length} purchase bills have a balance due`,`${money(sum(unpaid,'balance'))} remains after matching recorded posted vendor payments.`,'Reconcile credits and agreed terms, then record payments against the correct purchase bills.',['transactions','vendorPayments'],[['Bills due',unpaid.length],['Balance due',money(sum(unpaid,'balance'))]],['Vendor','Purchase','Invoice','Balance'],unpaid.map(r=>[r.supplier,r.id,r.invoice,money(r.balance)]),action('finance','Vendor Payments','Review vendor payments'),sum(unpaid,'balance'));
  }
  const drafts=sources.purchaseDrafts.filter(r=>['Draft','PendingApproval'].includes(r.status));
  if(drafts.length)add('purchase-queue','Vendors','Warning',`${drafts.length} purchases need completion or approval`,'Drafts and submitted purchases have not yet completed the posting workflow.','Review invoices, quantities, and approval status. Only approve when the purchase is verified.',['purchaseDrafts'],[['Draft',drafts.filter(r=>r.status==='Draft').length],['Awaiting approval',drafts.filter(r=>r.status==='PendingApproval').length]],['Purchase','Vendor','Invoice','Status'],drafts.map(r=>[r.purchaseNumber||r.id,r.entry?.supplier,r.entry?.invoice,r.status]),action('inventory','purchase','Review purchases'));
  const maxDays=Math.max(1,Math.min(365,finite(input.settings?.['Purchase controls']?.maximumDraftDays)||7));
  const overdueDrafts=drafts.filter(r=>purchaseDraftDeadline(r,maxDays,now).overdue);
  if(overdueDrafts.length)add('old-drafts','Vendors','Warning',`${overdueDrafts.length} purchase drafts exceed ${maxDays} days`,`${input.settings?.['Purchase controls']?.maximumDraftDays?'The configured draft review limit':'A 7-day review threshold'} is checked against the original creation date.`,'Review and complete or remove obsolete drafts. Drafts are never deleted by this analysis.',['purchaseDrafts'],[['Older drafts',overdueDrafts.length]],['Purchase','Created','Age in days'],overdueDrafts.map(r=>[r.purchaseNumber||r.id,r.createdAt,purchaseDraftDeadline(r,maxDays,now).age]),action('inventory','purchase','Review purchase drafts'));
  const lateOrders=live(sources.purchaseOrders).filter(r=>!['closed','draft'].includes(lower(r.status))&&r.expectedDelivery&&ageDays(r.expectedDelivery,now)>0);
  if(lateOrders.length)add('late-po','Vendors','Warning',`${lateOrders.length} open purchase orders are past expected delivery`,'Only orders with a recorded expected delivery date are checked.','Confirm receipt status and follow up with the supplier before placing duplicate orders.',['purchaseOrders'],[['Late orders',lateOrders.length]],['Purchase order','Vendor','Expected delivery','Status'],lateOrders.map(r=>[r.poNumber||r.id,r.vendor||r.supplier,r.expectedDelivery,r.status]),action('inventory','purchase-order','Review purchase orders'));
  const rates=new Map();for(const r of transactions.filter(r=>r.type==='Purchase'&&r.purchaseId&&has(r.netUnitCost??r.unitCost)&&finite(r.netUnitCost??r.unitCost)>0)){const key=`${r.itemId||r.item}|${r.unit||''}|${r.batchKey||''}`;const pool=rates.get(key)||[];pool.push(r);rates.set(key,pool);}
  const increases=[];for(const pool of rates.values()){pool.sort((a,b)=>(timestamp(b)||0)-(timestamp(a)||0));const latest=pool[0],old=pool.find(r=>r.purchaseId!==latest.purchaseId);if(old&&timestamp(latest)>=start){const before=finite(old.netUnitCost??old.unitCost),after=finite(latest.netUnitCost??latest.unitCost);if(after>=before*1.1)increases.push([latest.item||latest.itemId,money(before),money(after),`${((after/before-1)*100).toFixed(1)}%`]);}}
  if(increases.length)add('purchase-cost','Vendors','Warning',`${increases.length} purchase unit costs rose by 10% or more`,'Compares the latest two distinct posted purchases for the same item, unit, and batch key.','Verify pack sizes and invoice discounts, then review supplier terms and selling margins.',['transactions'],[['Cost increases',increases.length]],['Product','Previous cost','Latest cost','Increase'],increases,action('inventory','purchase','Review purchase costs'));
  const expenses=period(live(sources.expenses).filter(r=>lower(r.status)==='posted'));
  if(expenses.length)add('expense-overview','Finance','Info',`${money(sum(expenses,'amount'))} of posted expenses`,'This is recorded operating spend for the selected period. Purchases are not counted as operating expenses.','Review the largest expense categories and confirm posting completeness before using these figures for budgeting.',['expenses'],[['Posted expenses',expenses.length],['Recorded spend',money(sum(expenses,'amount'))]],['Date','Category','Amount'],expenses.map(r=>[r.date,r.category||r.purpose,money(r.amount)]),action('finance','Expenses','Review expenses'),sum(expenses,'amount'));
  const journals=sources.journals.filter(r=>lower(r.status)==='posted'&&Array.isArray(r.lines));
  const unbalanced=journals.filter(r=>Math.abs(sum(r.lines,'debit')-sum(r.lines,'credit'))>.01);
  if(unbalanced.length)add('journal-balance','Finance','Critical',`${unbalanced.length} posted journals do not balance`,'The recorded debit and credit totals differ by more than ₹0.01.','Review the journal lines and correct the source record before relying on ledger totals.',['journals'],[['Unbalanced journals',unbalanced.length]],['Reference','Debits','Credits'],unbalanced.map(r=>[r.reference||r.id,money(sum(r.lines,'debit')),money(sum(r.lines,'credit'))]),action('finance','Journal Entries','Review journals'));
  const pendingReceipts=live(sources.receipts).filter(r=>lower(r.status)==='pending');
  if(pendingReceipts.length)add('pending-receipts','Finance','Warning',`${pendingReceipts.length} receipts await confirmation`,'Pending receipts are not confirmed collections.','Match each receipt to supporting payment evidence before marking it received.',['receipts'],[['Pending amount',money(sum(pendingReceipts,'amount'))]],['Date','Customer / purpose','Amount'],pendingReceipts.map(r=>[r.date,r.customer||r.purpose,money(r.amount)]),action('finance','Receipts','Review receipts'),sum(pendingReceipts,'amount'));
  const banks=live(sources.banks);
  if(banks.length&&!banks.some(r=>r.isPrimary))add('bank-primary','Finance','Info','No active bank account is marked primary','Automatic bank mappings may need a default account.','Review bank account setup and select the correct primary account. No payment details are changed by this analysis.',['banks'],[['Active bank accounts',banks.length]],['Account name','Bank'],banks.map(r=>[r.accountName,r.bankName]),action('finance','Bank Accounts','Review bank accounts'));
  const voids=period(live(sources.voids));
  if(voids.length)add('void-review','Operations','Info',`${voids.length} voided items recorded in the period`,'These are recorded void events, not a fraud assessment.','Review reasons and authorization records for recurring issues.',['voids'],[['Recorded events',voids.length]],['Date','Item','Reason'],voids.map(r=>[r.createdAt||r.date,r.itemName||r.name,r.reason]),action('reports','Void and refund','Review void events'));
  const shifts=period(sources.shifts.filter(r=>r.closedAt)),variance=shifts.filter(r=>has(r.variance)&&Math.abs(finite(r.variance))>.01);
  if(variance.length)add('cash-variance','Operations','Warning',`${variance.length} cashier shifts closed with cash differences`,'Each difference is based on the saved closing variance, not an inferred loss.','Reconcile bills, refunds, cash movements, and variance notes with the cashier.',['shifts'],[['Shifts to review',variance.length],['Absolute differences',money(sum(variance,r=>Math.abs(finite(r.variance))))]],['Cashier','Closed','Variance','Note'],variance.map(r=>[r.cashierName,r.closedAt,money(r.variance),r.varianceNote||'Not recorded']),action('reports','Cashier closing','Review cashier closing'),sum(variance,r=>Math.abs(finite(r.variance))));
  const oldShifts=sources.shifts.filter(r=>!r.closedAt&&ageDays(r.openedAt||r.createdAt,now)>=1);
  if(oldShifts.length)add('open-shifts','Operations','Warning',`${oldShifts.length} cashier shifts remain open from an earlier day`,'Overnight trading may be legitimate; the opening timestamp is shown for review.','Verify the shift with the cashier before closing or opening another shift.',['shifts'],[['Open shifts',oldShifts.length]],['Cashier','Opened'],oldShifts.map(r=>[r.cashierName,r.openedAt||r.createdAt]),action('pos',null,'Open POS'));
  const stalled=live(sources.kds).filter(r=>!['completed','served','delivered','closed'].includes(lower(r.status))&&date(r.createdAt)&&now-date(r.createdAt)>=30*60000);
  if(stalled.length)add('kitchen-delay','Operations','Warning',`${stalled.length} kitchen tickets have been open for 30+ minutes`,'This checks recorded creation time and current status; it does not predict cooking time.','Confirm ticket status and prioritize ready or delayed orders with the kitchen.',['kds'],[['Tickets',stalled.length]],['Ticket','Status','Opened'],stalled.map(r=>[r.orderNumber||r.id,r.status,r.createdAt]),action('kds',null,'Open kitchen display'));
  const waiting=live(sources.tables).filter(r=>r.status==='Ready for billing');
  if(waiting.length)add('table-billing','Operations','Warning',`${waiting.length} table orders are ready for billing`,'These orders are waiting in the reception billing queue.','Review table details and complete billing when the customer is ready.',['tables'],[['Orders to bill',waiting.length]],['Table','Order','Status'],waiting.map(r=>[r.tableName,r.orderNumber||r.id,r.status]),action('tables',null,'Review tables'));
  const menu=live(sources.menu),missingPhotos=menu.filter(r=>!r.image);
  if(missingPhotos.length)add('menu-photos','Merchandising','Opportunity',`${missingPhotos.length} active menu items have no photo`,'Menu catalog tiles use these saved images.','Add clear product photos so cashiers and customers can recognize items faster.',['menu'],[['Items without photos',missingPhotos.length]],['Item','Category'],missingPhotos.map(r=>[r.name,r.category]),action('menu','items','Review menu'));
  const offers=live(sources.offers).filter(r=>!input.canAccessOption||input.canAccessOption('offers',offerPermission(r)));
  const expired=offers.filter(r=>['Active','Scheduled'].includes(r.status)&&r.endDate&&ageDays(r.endDate,now)>1);
  if(expired.length)add('expired-offers','Promotions','Info',`${expired.length} offers have passed their end date`,'Their schedule prevents application in POS; the saved status may still read Active or Scheduled.','Review campaign results and pause or revise offers only if the campaign should continue.',['offers'],[['Ended campaigns',expired.length]],['Offer','End date','Saved status'],expired.map(r=>[r.name,r.endDate,r.status]),action('offers','All offers','Review promotions'));
  const promoLoss=[];for(const offer of offers.filter(r=>r.template==='product-discounts'&&!promotionAvailability(r,now)))for(const line of offer.productDiscounts||[]){const product=stock.find(r=>String(r.id)===String(line.itemId));if(product&&finite(product.cost)>0&&has(line.offerPrice)&&finite(line.offerPrice)<finite(product.cost))promoLoss.push([offer.name,product.name,money(product.cost),money(line.offerPrice)]);}
  if(promoLoss.length)add('promo-cost','Promotions','Warning','Active product offers are below recorded unit cost','Offer rates are compared with Product Master costs for the same product ID.','Check whether the markdown is intentional and confirm the allowed margin before continuing.',['offers','inventory'],[['Offer/product combinations',promoLoss.length]],['Offer','Product','Cost','Offer rate'],promoLoss,action('offers','All offers','Review offer rates'));
  const openAttendance=sources.attendance.filter(r=>r.checkIn&&!r.checkOut&&ageDays(r.checkIn,now)>=1);
  if(openAttendance.length)add('attendance-open','Attendance','Warning',`${openAttendance.length} attendance records remain open from an earlier day`,'This flags missing checkout records, not employee absence or misconduct.','Verify the time with the employee and use the authorized manual correction workflow.',['attendance'],[['Open records',openAttendance.length]],['Employee','Check-in'],openAttendance.map(r=>[r.employeeName||r.name,r.checkIn]),action('attendance','Attendance Records','Review attendance'));
  const leaves=sources.leaves.filter(r=>r.status==='Pending');
  if(leaves.length)add('leave-queue','Attendance','Warning',`${leaves.length} leave requests await review`,'These requests are still marked Pending.','Review staffing coverage and each request before approving or rejecting.',['leaves'],[['Pending requests',leaves.length]],['Employee','From','To'],leaves.map(r=>[r.employeeName,r.from,r.to]),action('attendance','Leave Approvals','Review leave approvals'));
  const wastage=period(live(sources.wastage));
  if(wastage.length)add('wastage','Production','Warning',`${wastage.length} production wastage records need review`,'Quantities may use different units and are deliberately not combined into one total.','Review reasons and repeated items; adjust batch planning after checking actual demand.',['wastage'],[['Wastage entries',wastage.length]],['Date','Item','Quantity','Reason'],wastage.map(r=>[r.date||r.createdAt,r.item||r.itemName||r.name,`${r.quantity??r.qty??''} ${r.unit||''}`,r.reason]),action('production','Wastage','Review wastage'));
  const unfinished=live(sources.batches).filter(r=>!['completed','finished','closed'].includes(lower(r.status))&&ageDays(r.date||r.startedAt||r.createdAt,now)>=1);
  if(unfinished.length)add('production-open','Production','Warning',`${unfinished.length} production batches remain open from an earlier day`,'Only batches with a usable date and an unfinished status are included.','Confirm materials issued and output quantities before completing the batch.',['batches'],[['Open batches',unfinished.length]],['Batch','Recipe','Status'],unfinished.map(r=>[r.batchNumber||r.id,r.recipeName||r.name,r.status]),action('production','Batches','Review production batches'));
  const incompleteRecipes=live(sources.recipes).filter(r=>!Array.isArray(r.ingredients)||!r.ingredients.length||r.ingredients.some(i=>!i.name||!has(i.qty)||finite(i.qty)<=0));
  if(incompleteRecipes.length)add('recipe-setup','Production','Warning',`${incompleteRecipes.length} recipes have incomplete ingredient quantities`,'Recipe costing cannot be complete without ingredients and valid quantities.','Complete ingredients, units, and output quantities before using recipe cost estimates.',['recipes'],[['Recipes to review',incompleteRecipes.length]],['Recipe','Ingredient entries'],incompleteRecipes.map(r=>[r.name,Array.isArray(r.ingredients)?r.ingredients.length:0]),action('production','Recipes','Review recipes'));
  const emptyFood=live(sources.foodStock).filter(r=>has(r.available)&&finite(r.available)<=0);
  if(emptyFood.length)add('food-availability','Production','Warning',`${emptyFood.length} finished food items have no available stock`,'These are the saved available quantities in food stock.','Check prepared stock and plan production before accepting further orders.',['foodStock'],[['Food items',emptyFood.length]],['Item','Available'],emptyFood.map(r=>[r.itemName||r.name,`${r.available} ${r.unit||''}`]),action('item-stock',null,'Review item stock'));
  const noCategory=stock.filter(r=>!r.category||!r.department);
  if(noCategory.length)add('classification','Setup','Info',`${noCategory.length} products have incomplete classification`,'A department or category is missing in Product Master.','Complete inventory setup links to make product entry and reporting more consistent.',['inventory'],[['Incomplete products',noCategory.length]],['Product','Department','Category'],noCategory.map(r=>[r.name,r.department||'Missing',r.category||'Missing']),inventoryAction);
  const disabled=sources.users.filter(r=>lower(r.status)==='inactive');
  if(disabled.length)add('inactive-users','Administration','Info',`${disabled.length} user accounts are marked inactive`,'This is an account review reminder; no suspicious behavior is inferred.','Confirm that former staff and unused accounts remain inactive and review role assignments.',['users'],[['Inactive accounts',disabled.length]],['Name','Role','Status'],disabled.map(r=>[r.name,r.role,r.status]),action('admin','all','Review users'));
  const sourceCoverage=intelligenceSources.filter(s=>available.has(s.id)).map(s=>({id:s.id,label:s.label,category:s.category,records:sources[s.id].length}));
  insights.sort((a,b)=>severityOrder[a.severity]-severityOrder[b.severity]||b.amount-a.amount||a.id.localeCompare(b.id));
  return {insights,coverage:sourceCoverage,days,generatedAt:now.toISOString(),start:start.toISOString(),counts:Object.fromEntries(Object.keys(severityOrder).map(s=>[s,insights.filter(i=>i.severity===s).length])),totals:{grossSales:gross,refunds:refundAmount,netSales:net,bills:current.length},recordCount:sourceCoverage.reduce((n,s)=>n+s.records,0)};
}
