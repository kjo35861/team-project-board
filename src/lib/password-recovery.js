/** Password recovery UI uses Supabase's verified recovery event, never a URL flag as authority. */
export function mountPasswordRecovery({client,root,onStart,onFinish}) {
  const panel=document.createElement('section');panel.hidden=true;panel.id='auth-recovery-panel';
  panel.innerHTML='<h1 id="recovery-title">비밀번호 재설정</h1><p class="auth-description" id="recovery-copy"></p><form class="auth-form"><label class="auth-field" data-recovery-email>이메일<input type="email" name="email" autocomplete="email" required></label><label class="auth-field" data-recovery-password hidden>새 비밀번호<input type="password" name="password" minlength="8" maxlength="128" autocomplete="new-password" disabled></label><label class="auth-field" data-recovery-confirm hidden>새 비밀번호 확인<input type="password" name="confirm" minlength="8" maxlength="128" autocomplete="new-password" disabled></label><p class="field-error" role="alert"></p><button class="auth-primary-button" type="submit">재설정 메일 보내기</button><button class="auth-secondary-button" type="button" data-recovery-cancel>로그인으로 돌아가기</button></form>';
  panel.setAttribute('aria-labelledby','recovery-title');root.append(panel);
  const forgot=document.createElement('button');forgot.type='button';forgot.className='auth-text-button';forgot.textContent='비밀번호를 잊으셨나요?';
  root.querySelector('#auth-form-panel').append(forgot);
  const form=panel.querySelector('form'),email=form.elements.email,password=form.elements.password,confirm=form.elements.confirm;
  const error=panel.querySelector('[role=alert]'),copy=panel.querySelector('#recovery-copy'),submit=form.querySelector('[type=submit]');
  let mode=null,busy=false;
  function show(next,text='') {
    mode=next;onStart();panel.hidden=false;error.textContent=text;
    const update=mode==='update';
    panel.querySelector('[data-recovery-email]').hidden=update;email.disabled=update;
    for(const type of ['password','confirm']) {panel.querySelector(`[data-recovery-${type}]`).hidden=!update;form.elements[type].disabled=!update;form.elements[type].required=update;}
    submit.textContent=update?'새 비밀번호 저장':'재설정 메일 보내기';
    copy.textContent=update?'8~128자의 새 비밀번호를 입력하세요. 저장 후 다시 로그인합니다.':'가입할 때 사용한 이메일로 재설정 링크를 보내드립니다.';
  }
  function lock(value) {
    busy=value;submit.disabled=value;panel.querySelector('[data-recovery-cancel]').disabled=value;
    email.readOnly=value;password.readOnly=value;confirm.readOnly=value;
  }
  function finish(message) {
    panel.hidden=true;mode=null;password.value='';confirm.value='';
    window.history.replaceState(null,'',window.location.pathname);
    onFinish(message);
  }
  forgot.addEventListener('click',()=>{email.value=root.querySelector('#auth-email').value;show('request');email.focus();});
  panel.querySelector('[data-recovery-cancel]').addEventListener('click',async()=>{
    if(busy)return;lock(true);
    try {if(mode==='update'){const result=await client.auth.signOut({scope:'local'});if(result.error)throw result.error;}finish('');}
    catch {error.textContent='로그인 화면으로 돌아가지 못했습니다. 다시 시도해 주세요.';}
    finally{lock(false);}
  });
  form.addEventListener('submit',async event=>{
    event.preventDefault();if(busy||!form.reportValidity())return;error.textContent='';
    if(mode==='update'&&(password.value.length<8||password.value.length>128||password.value!==confirm.value)) {error.textContent='8~128자의 동일한 비밀번호를 두 번 입력해 주세요.';return;}
    lock(true);
    let passwordChanged=false;
    try {
      if(mode==='update') {
        const result=await client.auth.updateUser({password:password.value});if(result.error)throw result.error;passwordChanged=true;
        password.value='';confirm.value='';
        const out=await client.auth.signOut({scope:'local'});if(out.error)throw out.error;
        finish('비밀번호를 변경했습니다. 새 비밀번호로 로그인해 주세요.');
      } else {
        const redirect=new URL(window.location.pathname,window.location.origin);redirect.searchParams.set('recovery','1');
        const result=await client.auth.resetPasswordForEmail(email.value.trim(),{redirectTo:redirect.toString()});if(result.error)throw result.error;
        copy.textContent='입력한 주소에 가입된 계정이 있다면 재설정 메일이 발송됩니다. 메일함과 스팸함을 확인해 주세요.';
      }
    } catch {error.textContent=passwordChanged?'비밀번호는 변경되었지만 로그아웃하지 못했습니다. 로그인으로 돌아가기를 다시 눌러 주세요.':mode==='update'?'비밀번호를 저장하지 못했습니다. 링크가 만료됐다면 새 메일을 요청해 주세요.':'메일을 보내지 못했습니다. 이메일과 연결 상태를 확인하고 잠시 후 재시도해 주세요.';}
    finally{lock(false);}
  });
  const params=new URLSearchParams(window.location.search);
  if(params.get('recovery')==='1') show('request','새 비밀번호 화면이 열리지 않으면 링크가 만료되었을 수 있습니다. 새 메일을 요청해 주세요.');
  return {
    get isActive(){return mode!==null;},
    handleEvent(event,session) {
      if(event==='PASSWORD_RECOVERY') {
        if(session?.user?.id) {password.value='';confirm.value='';show('update');}
        else show('request','유효한 복구 세션이 없습니다. 새 메일을 요청하세요.');
        return true;
      }
      return mode!==null;
    },
  };
}
