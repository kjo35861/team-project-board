begin;
select plan(12);
select has_function('public','get_my_profile',array[]::text[],'Self profile read exists');
select has_function('public','set_my_display_name',array['text'],'Self name write exists');
select ok(not has_function_privilege('anon','public.get_my_profile()','EXECUTE'),'Anonymous cannot read profiles');
select ok(not has_function_privilege('anon','public.set_my_display_name(text)','EXECUTE'),'Anonymous cannot set a profile');
select ok(not has_table_privilege('authenticated','public.profiles','SELECT'),'Direct profile access remains closed');
insert into auth.users(id,aud,role,email,email_confirmed_at) values
 ('aa060000-0000-4000-8000-000000000001','authenticated','authenticated','profile-a@example.test',now()),
 ('aa060000-0000-4000-8000-000000000002','authenticated','authenticated','profile-b@example.test',now());
insert into public.profiles(id,display_name) values('aa060000-0000-4000-8000-000000000002','Other user');
set local role authenticated;
select set_config('request.jwt.claim.sub','aa060000-0000-4000-8000-000000000001',true);
select is(public.set_my_display_name('  My name  '),'My name','Names are trimmed and self-created');
select is((select display_name from public.get_my_profile()),'My name','Read returns own saved name');
select throws_ok($$select public.set_my_display_name(' ')$$,'22023',null,'Blank name is rejected');
select throws_ok($$select public.set_my_display_name(repeat('x',81))$$,'22023',null,'Oversized name is rejected');
reset role;
select is((select display_name from public.profiles where id='aa060000-0000-4000-8000-000000000002'),'Other user','Other profiles remain unchanged');
set local role authenticated;
select set_config('request.jwt.claim.sub','',true);
select throws_ok($$select public.set_my_display_name('No identity')$$,'28000',null,'No authenticated identity cannot save');
select is((select count(*)::integer from public.get_my_profile()),0,'No identity cannot read a profile');
reset role;
select * from finish();
rollback;
