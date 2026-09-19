import assert from 'node:assert/strict';
import {evaluateDynamicSql} from '../lib/verification/harness/sql-harness';
const ddl=`CREATE TABLE customer_orders(order_id INTEGER,customer_id INTEGER,order_date DATE,amount DECIMAL(10,2));
INSERT INTO customer_orders VALUES (1,10,'2026-01-01',100.00),(2,10,'2026-01-02',50.00),(3,20,'2026-01-01',75.00);`;
const canonical=`SELECT order_id,customer_id,order_date,amount,SUM(amount) OVER(PARTITION BY customer_id ORDER BY order_date,order_id ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS running_total FROM customer_orders ORDER BY customer_id,order_date,order_id`;
const policy={allowedTables:['customer_orders'],requiredPartitions:['customer_id'],requiredOrderings:['order_date','order_id'],requireWindowFunction:true};
async function main(){
 const good=await evaluateDynamicSql(canonical,[{id:'public',name:'Basic running total',isPublic:true,fixtureDdl:ddl,canonicalSql:canonical,orderSensitive:true}],policy);
 if(good.verdict!=='ACCEPTED') console.error('GOOD REPORT',JSON.stringify(good,null,2));
 assert.equal(good.verdict,'ACCEPTED');
 assert.equal(good.allPassed,true);
 const wrong=await evaluateDynamicSql(`SELECT order_id,customer_id,order_date,amount,SUM(amount) OVER(ORDER BY order_date) AS running_total FROM customer_orders ORDER BY customer_id,order_date,order_id`,[{id:'public',name:'Basic running total',isPublic:true,fixtureDdl:ddl,canonicalSql:canonical,orderSensitive:true}],policy);
 assert.equal(wrong.allPassed,false);
 const unauthorized=await evaluateDynamicSql(`SELECT * FROM secret_table`,[{id:'public',name:'Security',isPublic:true,fixtureDdl:ddl,canonicalSql:canonical,orderSensitive:true}],policy);
 assert.equal(unauthorized.verdict,'COMPILE_ERROR');
 console.log('[PATIMA] Verification resilience gate passed.');
}
main().catch(error=>{console.error(error);process.exit(1);});