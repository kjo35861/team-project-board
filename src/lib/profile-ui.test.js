// @vitest-environment jsdom
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {readMyProfile,saveMyDisplayName,mountProfileUI} from './profile-ui.js';
const client=(data)=>({auth:{getUser:vi.fn(async()=>({data:{user:{id:'u'}}}))},rpc:vi.fn(async()=>({data}))});
it('reads only the authenticated user profile and rejects cross-user responses',async()=>{
 expect(await readMyProfile(client([{user_id:'u',display_name:'Name'}]))).toBe('Name');
 await expect(readMyProfile(client([{user_id:'other',display_name:'Secret'}]))).rejects.toMatchObject({code:'request_failed'});
});
it('saves trimmed allowed name only and rejects invalid inputs before access',async()=>{
 const c=client('Name');expect(await saveMyDisplayName(c,' Name ')).toBe('Name');
 expect(c.rpc).toHaveBeenCalledWith('set_my_display_name',{p_display_name:'Name'});
 c.rpc.mockClear();await expect(saveMyDisplayName(c,' '.repeat(4))).rejects.toMatchObject({code:'invalid_input'});expect(c.rpc).not.toHaveBeenCalled();
 await expect(saveMyDisplayName(c,'a'.repeat(81))).rejects.toMatchObject({code:'invalid_input'});
});
it('blocks unauthenticated saves and safe-maps server failures',async()=>{
 const c=client('Name');c.auth.getUser.mockResolvedValue({data:{user:null}});
 await expect(saveMyDisplayName(c,'Name')).rejects.toMatchObject({code:'unauthenticated'});expect(c.rpc).not.toHaveBeenCalled();
 c.auth.getUser.mockResolvedValue({data:{user:{id:'u'}}});c.rpc.mockResolvedValue({error:{code:'42501'}});
 await expect(saveMyDisplayName(c,'Name')).rejects.toMatchObject({code:'forbidden'});
});
it('preserves a failed name draft and prevents duplicate saves',async()=>{
 document.body.innerHTML='<div class="profile-row"><span class="avatar"></span><strong>Email</strong></div>';
 const c=client([{user_id:'u',display_name:null}]);const ui=mountProfileUI({client:c});await Promise.resolve();await Promise.resolve();
 document.querySelector('.profile-edit').click();document.querySelector('dialog input').value='Draft';
 c.rpc.mockResolvedValue({error:{code:'42501'}});const form=document.querySelector('dialog form');form.dispatchEvent(new Event('submit',{cancelable:true}));form.dispatchEvent(new Event('submit',{cancelable:true}));
 for(let i=0;i<10;i++)await Promise.resolve();
 expect(document.querySelector('dialog input').value).toBe('Draft');expect(document.querySelector('dialog').open).toBe(true);ui.dispose();
});
it('ignores a late initial read after a newer profile save',async()=>{
 document.body.innerHTML='<div class="profile-row"><span class="avatar"></span><strong>Email</strong></div>';
 let resolveRead;const pending=new Promise(resolve=>{resolveRead=resolve;});
 const c=client(null);c.rpc.mockImplementation(name=>name==='get_my_profile'?pending:Promise.resolve({data:'New name'}));
 const ui=mountProfileUI({client:c});for(let i=0;i<4;i++)await Promise.resolve();
 document.querySelector('.profile-edit').click();document.querySelector('dialog input').value='New name';
 document.querySelector('dialog form').dispatchEvent(new Event('submit',{cancelable:true}));
 for(let i=0;i<10;i++)await Promise.resolve();
 resolveRead({data:[{user_id:'u',display_name:'Old name'}]});
 for(let i=0;i<10;i++)await Promise.resolve();
 expect(document.querySelector('.profile-row strong').textContent).toBe('New name');
 ui.dispose();
});
