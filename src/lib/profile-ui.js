import { BoardRepositoryError, toRepositoryError } from './board-repository.js';
export async function readMyProfile(client) {
  const auth=await client.auth.getUser();
  if(auth.error) throw toRepositoryError(auth.error);
  if(!auth.data?.user?.id) throw new BoardRepositoryError('unauthenticated');
  let result;
  try {result=await client.rpc('get_my_profile');} catch(e){throw toRepositoryError(e);}
  if(result.error) throw toRepositoryError(result.error);
  const row=result.data?.[0];
  if(!Array.isArray(result.data)||result.data.length!==1||row?.user_id!==auth.data.user.id
    ||!(row.display_name===null||typeof row.display_name==='string')) throw new BoardRepositoryError('request_failed');
  return row.display_name;
}
export async function saveMyDisplayName(client,input) {
  const name=typeof input==='string'?input.trim():'';
  if(!name||Array.from(name).length>80) throw new BoardRepositoryError('invalid_input');
  const auth=await client.auth.getUser();
  if(auth.error) throw toRepositoryError(auth.error);
  if(!auth.data?.user?.id) throw new BoardRepositoryError('unauthenticated');
  let result;
  try{result=await client.rpc('set_my_display_name',{p_display_name:name});}catch(e){throw toRepositoryError(e);}
  if(result.error) throw toRepositoryError(result.error);
  if(result.data!==name) throw new BoardRepositoryError('request_failed');
  return name;
}
export function mountProfileUI({client,onSaved=()=>{}}) {
  const root=document.querySelector('.profile-row');
  if(!root) return {dispose(){}};
  let disposed=false,busy=false,name='',nameRevision=0;
  const button=document.createElement('button'); button.type='button';button.className='profile-edit';button.textContent='이름 변경';
  root.append(button);
  const dialog=document.createElement('dialog'); dialog.className='task-dialog';dialog.setAttribute('aria-labelledby','profile-title');
  dialog.innerHTML='<form class="auth-form"><h2 id="profile-title">표시 이름 변경</h2><p class="auth-description">팀원에게 표시할 이름을 입력하세요.</p><label class="auth-field">표시 이름<input name="displayName" maxlength="80" required autocomplete="nickname"></label><p role="alert" class="field-error"></p><div class="dialog-actions"><button type="button" class="secondary-button" data-profile-cancel>취소</button><button type="submit" class="primary-button">저장</button></div></form>';
  document.body.append(dialog);
  const input=dialog.querySelector('input'), form=dialog.querySelector('form'), error=dialog.querySelector('[role=alert]');
  function display(value){name=value||'';if(name){root.querySelector('strong').textContent=name;root.querySelector('.avatar').textContent=Array.from(name)[0];}}
  const readRevision=nameRevision;
  readMyProfile(client).then(value=>{if(!disposed&&readRevision===nameRevision)display(value);}).catch(()=>{});
  button.addEventListener('click',()=>{input.value=name;error.textContent='';if(dialog.showModal)dialog.showModal();else dialog.setAttribute('open','');input.focus();});
  dialog.querySelector('[data-profile-cancel]').addEventListener('click',()=>{if(!busy)if(dialog.close)dialog.close();else dialog.removeAttribute('open');});
  dialog.addEventListener('cancel',e=>{if(busy)e.preventDefault();});
  form.addEventListener('submit',async e=>{
    e.preventDefault();if(busy)return;
    busy=true;form.querySelectorAll('button,input').forEach(el=>el.disabled=true);error.textContent='';
    try {const value=await saveMyDisplayName(client,input.value);if(disposed)return;nameRevision+=1;display(value);if(dialog.close)dialog.close();else dialog.removeAttribute('open');onSaved(value);}
    catch(e){if(!disposed)error.textContent=e.code==='invalid_input'?'이름을 1~80자로 입력해 주세요.':'이름을 저장하지 못했습니다. 연결과 로그인 상태를 확인하고 다시 시도해 주세요.';}
    finally{busy=false;if(!disposed)form.querySelectorAll('button,input').forEach(el=>el.disabled=false);}
  });
  return {dispose(){disposed=true;button.remove();dialog.remove();}};
}
