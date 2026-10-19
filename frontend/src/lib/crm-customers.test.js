import test from 'node:test';
import assert from 'node:assert/strict';
import { billCustomerTypes, buildCustomerRows, mergeCustomerEdits } from './crm-customers.js';
test('classifies retail, wholesale, online and older item pricing metadata', () => {
  assert.deepEqual(billCustomerTypes({}), ['Retail']);
  assert.deepEqual(billCustomerTypes({pricingMode:'Wholesale'}), ['Wholesale']);
  assert.deepEqual(billCustomerTypes({orderType:'Online',pricingMode:'Retail'}), ['E-commerce']);
  assert.deepEqual(billCustomerTypes({channel:'E-commerce'}), ['E-commerce']);
  assert.deepEqual(billCustomerTypes({items:[{pricingMode:'Wholesale'}]}), ['Wholesale']);
  assert.deepEqual(billCustomerTypes({orderType:'Delivery'}), ['Retail']);
});
const bills = [
  {customerName:'Alex',customerMobile:'9876543210',pricingMode:'Wholesale',total:100},
  {customerName:'Alex',customerMobile:'+91 9876543210',orderType:'Online',total:50},
  {customerName:'Sam',customerMobile:'9876543211',total:40},
  {total:50},
];
test('deduplicates customers with multiple channels and preserves existing details', () => {
  const rows=buildCustomerRows(bills,[{id:'9876543210',values:['Alex Ltd','+91 9876543210','160','Rice']}]);
  assert.equal(rows.length,2);assert.equal(rows[0][0],'Alex Ltd');assert.equal(rows[0][2],'160');
  assert.deepEqual(rows[0].customerTypes,['Wholesale','E-commerce']);
  assert.equal(rows.filter(row=>row.customerTypes.includes('Retail')).length,1);
});
test('editing/deleting under a filter leaves hidden customers and old overrides unchanged', () => {
  const overrides=[{id:'9876543211',values:['Sam Ltd','9876543211','40','Tea']}];
  const rows=buildCustomerRows(bills,overrides), visible=rows.filter(row=>row.customerTypes.includes('Wholesale'));
  const edited=Object.assign([...visible[0]],{recordId:visible[0].recordId});edited[0]='Alex updated';
  const updates=mergeCustomerEdits(overrides,visible,[edited]);
  assert.equal(updates.find(row=>row.id==='9876543211').values[0],'Sam Ltd');
  assert.equal(buildCustomerRows(bills,updates)[0][0],'Alex updated');
  const deleted=mergeCustomerEdits(overrides,visible,[]);
  assert.equal(buildCustomerRows(bills,deleted).length,1);
  assert.equal(buildCustomerRows(bills,deleted)[0][0],'Sam Ltd');
});
