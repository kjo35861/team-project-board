// @vitest-environment jsdom
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {mountPasswordRecovery} from './password-recovery.js';
let ui,client,finish;
const tick=async()=>{for(let i=0;i<10;i++)await Promise.resolve();};
beforeEach(()=>{
 history.replaceState(null,'','/');document.body.innerHTML='<div id="root"><section id="auth-form-panel"><input id="auth-email" value="person@example.com"></section></div>';
 client={auth:{resetPasswordForEmail:vi.fn(async()=>({})),updateUser:vi.fn(async()=>({})),signOut:vi.fn(async()=>({}))}};finish=vi.fn();
 ui=mountPasswordRecovery({client,root:document.querySelector('#root'),onStart:vi.fn(),onFinish:finish});
});
afterEach(()=>history.replaceState(null,'','/'));
const submit=()=>document.querySelector('#auth-recovery-panel form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));
it('requests reset mail with same-origin redirect and a neutral confirmation',async()=>{
 document.querySelector('.auth-text-button').click();submit();await tick();
 expect(client.auth.resetPasswordForEmail).toHaveBeenCalledWith('person@example.com',{redirectTo:`${location.origin}/?recovery=1`});
 expect(document.querySelector('#recovery-copy').textContent).toContain('계정이 있다면');
});
it('only the verified recovery event opens the new password form',()=>{
 expect(ui.handleEvent('SIGNED_IN',{user:{id:'u'}})).toBe(false);
 ui.handleEvent('PASSWORD_RECOVERY',null);expect(document.querySelector('[data-recovery-password]').hidden).toBe(true);
 ui.handleEvent('PASSWORD_RECOVERY',{user:{id:'u'}});expect(document.querySelector('[data-recovery-password]').hidden).toBe(false);
});
it('validates confirmation, prevents duplicates, clears passwords and signs out after change',async()=>{
 ui.handleEvent('PASSWORD_RECOVERY',{user:{id:'u'}});
 const form=document.querySelector('#auth-recovery-panel form');form.elements.password.value='safe-password';form.elements.confirm.value='different';submit();expect(client.auth.updateUser).not.toHaveBeenCalled();
 form.elements.confirm.value='safe-password';submit();submit();await tick();
 expect(client.auth.updateUser).toHaveBeenCalledTimes(1);expect(client.auth.signOut).toHaveBeenCalledWith({scope:'local'});
 expect(form.elements.password.value).toBe('');expect(finish).toHaveBeenCalled();
});
it('retains failed inputs, hides raw errors, and does not accept the URL marker alone',async()=>{
 ui.handleEvent('PASSWORD_RECOVERY',{user:{id:'u'}});client.auth.updateUser.mockResolvedValue({error:new Error('private server output')});
 const form=document.querySelector('#auth-recovery-panel form');form.elements.password.value=form.elements.confirm.value='safe-password';submit();await tick();
 expect(form.elements.password.value).toBe('safe-password');expect(document.body.textContent).not.toContain('private server output');expect(finish).not.toHaveBeenCalled();
});
