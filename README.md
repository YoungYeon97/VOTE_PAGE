# VOTE_PAGE

GitHub Pages + Supabase 기반의 간단한 투표 페이지입니다.

## 기능

- 후보 목록 관리
- 1인당 최대 선택 수 설정
- 정해진 시각부터 자동 공개
- 참여코드 1회 사용 제한
- 관리자 로그인 후 설정 변경

## 파일 구조

- `index.html`: 투표 페이지
- `admin.html`: 관리자 페이지
- `styles.css`: 공통 스타일
- `js/config.js`: Supabase 연결 정보
- `js/supabase.js`: Supabase 클라이언트
- `js/vote.js`: 투표 페이지 로직
- `js/admin.js`: 관리자 페이지 로직
- `supabase/schema.sql`: 테이블, 정책, 함수

## 1. Supabase 준비

1. Supabase 프로젝트를 생성합니다.
2. SQL Editor에서 `supabase/schema.sql` 파일 내용을 실행합니다.
3. `Project Settings > API`에서 아래 값을 복사합니다.
   - `Project URL`
   - `anon public key`
4. `Authentication > Sign In / Providers`에서 Email 로그인을 켭니다.

## 2. 프런트 설정

`js/config.js`에서 아래 값을 채웁니다.

```js
window.VOTE_APP_CONFIG = {
  supabaseUrl: "https://YOUR_PROJECT.supabase.co",
  supabaseAnonKey: "YOUR_SUPABASE_ANON_KEY",
};
```

중요:

- `service_role` 키는 절대 넣지 않습니다.
- GitHub Pages에는 `anon key`만 사용합니다.

## 3. 첫 관리자 만들기

1. `admin.html` 페이지를 엽니다.
2. 이메일/비밀번호로 회원가입 또는 로그인을 합니다.
3. 관리자가 아직 없다면 `첫 관리자 등록` 버튼으로 현재 계정을 관리자 권한으로 등록합니다.

첫 번째 관리자만 자동 등록할 수 있고, 이후에는 이미 등록된 관리자만 설정을 바꿀 수 있습니다.

## 4. 투표 설정

관리자 페이지에서 아래 항목을 설정합니다.

- 투표 제목
- 공개 시작 시각
- 1인당 최대 선택 수
- 후보 목록
- 참여코드 생성

## 5. GitHub Pages 배포

1. 이 저장소를 GitHub에 푸시합니다.
2. GitHub 저장소의 `Settings > Pages`로 이동합니다.
3. 배포 소스를 현재 브랜치의 `/root`로 설정합니다.
4. 배포가 완료되면 아래 페이지를 사용합니다.
   - `https://YOUR_ID.github.io/REPO_NAME/`
   - `https://YOUR_ID.github.io/REPO_NAME/admin.html`

## 운영 메모

- 공개 시간 차단은 브라우저가 아니라 Supabase 함수에서 검사합니다.
- 참여코드는 1회만 사용할 수 있습니다.
- 같은 후보를 중복 선택하는 것은 허용하지 않습니다.
- 이 프로젝트는 한 번에 하나의 투표를 운영하는 단순 구조입니다.
