# 팀 프로젝트 협업 보드

팀원이 업무의 담당자·마감일·진행 상태를 공유하는 웹 앱입니다. Supabase 이메일 인증, 공유 보드·구성원·초대와 서버 업무 CRUD를 연결했습니다. 로그인 후 선택한 보드의 업무를 서버에서 읽고 저장합니다. 기존 `app.js` 로컬 프로토타입은 실행 경로에서 제외했으며, 이전 브라우저 자료는 자동으로 가져오지 않습니다.

### 2026-11-05 검증

- `npm test`: 18개 파일, 100개 테스트 통과.
- `npm run build`: 통과. 공유 보드 스타일도 빌드에 포함.
- 2026-11-05 Supabase SQL Editor에서 보드 DB 구조를 적용하고 인증 역할로 보드/업무 저장을 점검했습니다. 전체 pgTAP·여러 계정 권한·공유 검증은 남아 있습니다.
- 보드 연결 오류를 복구하고 앱의 정상 빈 목록 표시를 확인했습니다. 자세한 검증 범위는 `feature-implementation-status.md`를 참고하세요.
- `npm audit`: 개발 도구 Vitest를 4.1.12로 업데이트하여 보고된 취약점 0건. 업데이트 후 테스트와 빌드를 재검증했습니다.

업무 새로고침 버튼으로 최신 서버 내용을 가져옵니다. 실시간 푸시는 제공하지 않습니다. 아래 예전 진행 설명과 충돌하면 `feature-implementation-status.md`의 최신 검증 기록을 기준으로 합니다.

## 실행 요구사항

- Node.js 24
- npm
- Supabase 프로젝트(인증과 보드 기능을 실제로 사용하려는 경우)

```sh
npm install
```

로컬 개발 서버:

```sh
npm run dev
```

Vite가 출력한 로컬 주소를 브라우저에서 엽니다. 인증 환경 변수가 설정되지 않은 상태에서는 설정 안내 화면이 표시되고, 인증을 우회해 로컬 보드를 열지 않습니다.

## Supabase Auth 설정

1. Supabase 대시보드에서 프로젝트를 만들고 **Authentication → Providers → Email**에서 이메일 공급자를 활성화합니다.
2. 저장소 루트에 `.env.local` 파일을 만들고 다음 공개 설정을 지정합니다.

```dotenv
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_PUBLIC_KEY=your-publishable-or-anon-key
```

`VITE_SUPABASE_PUBLIC_KEY`에는 프로젝트의 `sb_publishable_...` 키 또는 레거시 JWT `anon` 키만 사용합니다. `service_role`, `sb_secret_...`, DB 비밀번호 등 비밀값은 절대로 `VITE_` 브라우저 변수나 저장소에 넣지 마세요. `.env.local`은 Git에서 제외됩니다.

3. 대시보드의 **Authentication → URL Configuration**에서 개발 주소(예: `http://localhost:5173`)를 Site URL과 허용된 Redirect URLs에 등록합니다. 배포 주소도 사용할 때 같은 방식으로 추가하세요.
4. 프로젝트 URL/공개 키를 설정한 뒤 Vite 서버를 다시 시작합니다.
5. 회원가입 후 인증 메일의 링크를 열어 이메일 인증을 마치고, 확인된 계정으로 로그인합니다. 보드 화면은 인증된 Supabase 세션에서만 표시됩니다.

이메일 발송 한도나 전달률이 개발을 막으면 Supabase Auth의 SMTP 설정을 구성하세요. 테스트 주소를 공개하거나 비밀 SMTP 자격 증명을 저장소에 커밋하지 마세요.

## 현재 기능과 한계

- 이메일/비밀번호 회원가입, 로그인, Supabase 세션 복원, 로그아웃
- 인증 대기 안내와 인증 메일 재전송, 기본 오류 메시지
- 인증된 사용자의 Supabase 보드 목록 조회 및 로딩·빈 목록·오류·재시도 상태 코드
- 공유 보드 생성, 이름 변경, 삭제를 Supabase RPC에 요청하는 UI 코드
- 구성원 roster, 소유자의 팀원 제거, 일반 팀원의 보드 나가기 UI 코드
- 초대 발급·복사·취소·상태 목록 및 초대 링크 수락 UI 코드
- 업무 조회·생성·수정·상태 변경·삭제 저장소와 서버 업무 화면 연결
- 보드별 roster 담당자, 검색·필터·정렬, 오류·재시도·새로고침
- 업무 작성자/소유자 삭제 규칙은 서버 RLS가 최종 강제하며 UI에도 반영
- 과거 localStorage 자료는 자동으로 가져오지 않음
- 실제 DB 마이그레이션·pgTAP·다중 계정 검증과 계정 복구/비밀번호 재설정 흐름은 남아 있음

## 명령어

```sh
npm run dev      # 개발 서버
npm run build    # 프로덕션 빌드
npm run preview  # 프로덕션 빌드 미리보기
npm test         # Vitest 테스트
```

자동 테스트와 빌드는 통과했습니다. 실제 Supabase 보드/업무 저장과 앱의 빈 목록 표시를 확인했습니다. 전체 권한·공유 시나리오 검증은 남아 있습니다.

## Vercel 배포

- 프로젝트: https://vercel.com/noi8/team-project-board
- 연결 저장소의 `main` 푸시를 통해 배포합니다. `vercel.json`에 Vite, `npm ci`, `npm run build`, 출력 폴더 `dist`, SPA 새로고침 경로를 명시했습니다.
- Node.js는 `24.x`로 고정합니다.
- Vercel 프로젝트의 Environment Variables에 `VITE_SUPABASE_URL`과 `VITE_SUPABASE_PUBLIC_KEY`를 설정해야 합니다. 필요한 Production/Preview 범위를 선택하고 환경 변수 변경 후 재배포하세요.
- 운영 환경에는 외부에서 접속할 수 있는 Supabase 프로젝트 HTTPS URL과 공개 키를 사용합니다. 개발용 localhost URL 및 비밀 키를 사용하지 않습니다. `.env` 파일은 업로드하지 않습니다.
- Supabase Auth 설정에서 실제 Vercel 서비스 주소를 Site URL/Redirect URLs에 등록합니다. DB 마이그레이션은 Vercel 정적 배포만으로 적용되지 않습니다.
- 작업 단위마다 테스트·빌드 후 커밋·푸시하며 GitHub 푸시와 Vercel 배포 결과를 따로 확인합니다.

설정 참고: [Vite on Vercel](https://vercel.com/docs/frameworks/frontend/vite).
