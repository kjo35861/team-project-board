import {it,expect,vi} from 'vitest';
import {fetchAllRowsById} from './paginated-query.js';
function query(pages){const calls=[];let index=0;return {calls,make:()=>{
 const q={order(){return q;},limit(){return q;},gt(key,id){calls.push([key,id]);return q;},then(resolve,reject){return Promise.resolve(pages[index++]).then(resolve,reject);}};return q;
}};}
it('continues when a server cap is smaller than the requested page',async()=>{
 const q=query([{data:[{id:'a'},{id:'b'}],count:3},{data:[{id:'c'}],count:1}]);
 expect(await fetchAllRowsById(q.make,200)).toEqual([{id:'a'},{id:'b'},{id:'c'}]);expect(q.calls).toEqual([['id','b']]);
});
it('rejects failed later pages instead of returning incomplete data',async()=>{
 const error={code:'42501'};const q=query([{data:[{id:'a'}],count:2},{error}]);
 await expect(fetchAllRowsById(q.make)).rejects.toBe(error);
});
it('rejects repeated or reversed IDs instead of looping or duplicating tasks',async()=>{
 const q=query([{data:[{id:'b'}],count:2},{data:[{id:'b'}],count:1}]);
 await expect(fetchAllRowsById(q.make)).rejects.toThrow('cursor');
});
