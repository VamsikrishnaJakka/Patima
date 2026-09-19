export async function executeWithSettledInterrupt(conn:any,sql:string,timeoutMs:number):Promise<any>{
 return new Promise((resolve,reject)=>{let completed=false,interrupted=false;const timer=setTimeout(()=>{if(completed)return;interrupted=true;try{conn.interrupt?.()}catch{}},timeoutMs);
 const settle=(fn:(v:any)=>void,v:any)=>{if(completed)return;completed=true;clearTimeout(timer);fn(v)};
 conn.runAndReadAll(sql).then((r:any)=>{if(interrupted)return settle(reject,new Error('EXECUTION_TIMEOUT_INTERRUPTED'));settle(resolve,r)}).catch((e:any)=>{if(interrupted)return settle(reject,new Error('EXECUTION_TIMEOUT_INTERRUPTED'));settle(reject,e)});
 });
}