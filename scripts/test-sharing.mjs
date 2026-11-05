import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
const url = process.env.API_URL;
const key = process.env.ANON_KEY;
assert(url && key, 'Local Supabase API_URL and ANON_KEY are required');
assert(['localhost','127.0.0.1','[::1]'].includes(new URL(url).hostname), 'Integration tests only run against a disposable loopback stack');
const makeClient = () => createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
async function account(label) {
  const client = makeClient();
  const email=`${label}-${randomUUID()}@example.com`,password=`T!${randomUUID()}`;
  const {data,error}=await client.auth.signUp({email,password});
  assert.ifError(error); assert(data.session, 'Local test Auth must auto-confirm test accounts');
  return {client,id:data.user.id,email,password};
}
const owner=await account('owner'), member=await account('member'), outsider=await account('outsider');
const rpc = async (user,name,args) => {const r=await user.client.rpc(name,args);assert.ifError(r.error);return r.data;};
await rpc(owner,'set_my_display_name',{p_display_name:'Owner name'});
assert.equal((await rpc(owner,'get_my_profile'))[0].display_name,'Owner name');
assert.equal((await rpc(member,'get_my_profile'))[0].display_name,null);
const board=await rpc(owner,'create_board',{p_name:'Isolated integration board'});
assert.equal((await member.client.from('boards').select('id').eq('id',board)).data.length,0);
const invite=(await rpc(owner,'create_board_invite',{p_board_id:board}))[0];
assert.equal(await rpc(member,'accept_board_invite',{p_token:invite.token}),board);
assert.equal((await member.client.from('boards').select('id').eq('id',board)).data.length,1);
assert((await member.client.rpc('accept_board_invite',{p_token:invite.token})).error,'Consumed invitation must fail');
assert((await member.client.rpc('create_board_invite',{p_board_id:board})).error,'Members cannot invite');
async function task(user,title,assignee=null) {
 const r=await user.client.from('tasks').insert({board_id:board,title,created_by:user.id,assignee_id:assignee}).select().single();
 assert.ifError(r.error);return r.data;
}
const owned=await task(owner,'Owner task',member.id);
const shared=await task(member,'Member task');
assert.equal((await outsider.client.from('tasks').select('id').eq('board_id',board)).data.length,0);
assert.equal((await outsider.client.from('tasks').update({status:'done'}).eq('id',owned.id).select()).data.length,0);
const updated=await member.client.from('tasks').update({status:'done'}).eq('id',owned.id).select().single();
assert.ifError(updated.error);assert.equal(updated.data.status,'done');
assert.equal((await member.client.from('tasks').delete().eq('id',owned.id).select()).data.length,0,'A member cannot delete another author task');
assert.equal((await owner.client.from('tasks').delete().eq('id',shared.id).select()).data.length,1,'Owner can delete member task');
const bad=await owner.client.from('tasks').update({assignee_id:outsider.id}).eq('id',owned.id);
assert(bad.error,'An outsider cannot be an assignee');
const forged=await member.client.from('tasks').update({created_by:member.id}).eq('id',owned.id);
assert(forged.error,'Managed creator identity cannot be changed');
await rpc(owner,'remove_board_member',{p_board_id:board,p_user_id:member.id});
const after=await owner.client.from('tasks').select('assignee_id').eq('id',owned.id).single();
assert.ifError(after.error);assert.equal(after.data.assignee_id,null);
assert.equal((await member.client.from('tasks').select('id').eq('board_id',board)).data.length,0);
const canceled=(await rpc(owner,'create_board_invite',{p_board_id:board}))[0];
await rpc(owner,'cancel_board_invite',{p_invite_id:canceled.invite_id});
assert((await outsider.client.rpc('accept_board_invite',{p_token:canceled.token})).error,'Canceled invitation must fail');
for(const user of [owner,member,outsider]) await user.client.auth.signOut();
console.log('PASS: three real accounts, invite acceptance/reuse/cancellation, shared CRUD, outsider isolation, deletion policy, assignee cleanup, immutable author. Disposable local data only.');

// Real recovery email and login test; all accounts and mail stay on the disposable stack.
const recovery=await account('recovery');
await recovery.client.auth.signOut({scope:'local'});
const mailBase=process.env.INBUCKET_URL||'http://127.0.0.1:54324';
assert(['localhost','127.0.0.1','[::1]'].includes(new URL(mailBase).hostname),'Mail access must be loopback');
const sent=await recovery.client.auth.resetPasswordForEmail(recovery.email,{redirectTo:'http://127.0.0.1:5173/?recovery=1'});
assert.ifError(sent.error);
let message;
for(let attempt=0;attempt<30;attempt++) {
 const response=await fetch(`${mailBase}/api/v1/messages`);
 assert(response.ok,'Local Mailpit API must be available');
 const inbox=await response.json();
 message=inbox.messages?.find(m=>m.To?.some(to=>to.Address===recovery.email));
 if(message)break;
 await new Promise(resolve=>setTimeout(resolve,500));
}
assert(message,'Recovery message was delivered to local Mailpit');
const mail=await (await fetch(`${mailBase}/api/v1/message/${message.ID}`)).json();
const links=`${mail.Text||''} ${mail.HTML||''}`.replaceAll('&amp;','&').match(/https?:[^\s"<>]+/g)||[];
const link=links.find(link=>link.includes('/auth/v1/verify?'))?.replace(/[).]+$/,'');
assert(link,'Recovery email includes verification link');
assert(['localhost','127.0.0.1','[::1]'].includes(new URL(link).hostname),'Recovery verification must be loopback');
const verified=await fetch(link,{redirect:'manual'});
assert.equal(verified.status,302,'Recovery link verifies and redirects');
const redirect=new URL(verified.headers.get('location'));
const tokens=new URLSearchParams(redirect.hash.slice(1));
assert(tokens.get('access_token')&&tokens.get('refresh_token'),'Recovery supplies an authenticated session');
const receiver=makeClient();
assert.ifError((await receiver.auth.setSession({access_token:tokens.get('access_token'),refresh_token:tokens.get('refresh_token')})).error);
const newPassword=`N!${randomUUID()}`;
assert.ifError((await receiver.auth.updateUser({password:newPassword})).error);
await receiver.auth.signOut({scope:'local'});
assert((await receiver.auth.signInWithPassword({email:recovery.email,password:recovery.password})).error,'Old password no longer signs in');
assert.ifError((await receiver.auth.signInWithPassword({email:recovery.email,password:newPassword})).error);
await receiver.auth.signOut({scope:'local'});
console.log('PASS: local recovery mail delivery, verified email link, password update, old-password rejection and new-password sign-in. No production account or external mailbox used.');
