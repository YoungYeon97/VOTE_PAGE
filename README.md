# VOTE_PAGE

GitHub Pages + Supabase 기반의 간단한 투표 페이지입니다.

## 기능

- 후보 목록 관리
- 1인당 최대 선택 수 설정
- 정해진 시각부터 자동 공개
- 관리자가 등록한 이름만 투표 가능
- 같은 이름 1회 제한
- 관리자 비밀번호 1개로 설정 변경

## 파일 구조

- `index.html`: 투표 페이지
- `admin.html`: 관리자 페이지
- `styles.css`: 공통 스타일
- `js/config.js`: Supabase 연결 정보
- `js/supabase.js`: Supabase 클라이언트
- `js/vote.js`: 투표 페이지 로직
- `js/admin.js`: 관리자 페이지 로직
- `supabase/schema.sql`: 테이블과 함수

## 1. Supabase 준비

1. Supabase 프로젝트를 생성합니다.
2. SQL Editor에서 `supabase/schema.sql` 파일 전체를 실행합니다.
3. `Project Settings > API`에서 아래 값을 복사합니다.
   - `Project URL`
   - `Publishable key` 또는 legacy `anon key`

중요:

- 이 버전은 `관리자 비밀번호` 방식입니다.
- 예전 SQL을 실행한 적이 있으면 새 `schema.sql`을 다시 실행해야 합니다.
- 새 `schema.sql`은 이전 투표 구조를 교체합니다. 이미 운영 중인 데이터가 있으면 바로 실행하지 말고 먼저 확인해야 합니다.

## 2. 프런트 설정

`js/config.js`에서 아래 값을 채웁니다.

```js
window.VOTE_APP_CONFIG = {
  supabaseUrl: "https://YOUR_PROJECT.supabase.co",
  supabaseAnonKey: "sb_publishable_...",
};
```

중요:

- `service_role`이나 `secret key`는 절대 넣지 않습니다.
- GitHub Pages에는 공개용 키만 사용합니다.

## 3. 관리자 비밀번호

- 기본 관리자 비밀번호는 `1111`입니다.
- `admin.html`에서 비밀번호를 입력하면 관리자 화면이 열립니다.
- 비밀번호는 브라우저의 현재 탭 세션에만 임시 저장됩니다.

더 안전하게 바꾸고 싶다면 Supabase SQL에서 `admin_settings.password_hash` 값을 새 해시로 바꿔야 합니다.

## 4. 투표 설정

관리자 페이지에서 아래 항목을 설정합니다.

- 투표 제목
- 공개 시작 시각
- 1인당 최대 선택 수
- 후보 목록
- 투표 가능 이름 목록

투표자는 관리자에게 등록된 이름만 입력해서 투표할 수 있습니다.
같은 이름으로는 한 번만 투표할 수 있습니다.

관리자 화면에서는 아래만 확인할 수 있습니다.

- 이름별 투표 여부
- 후보별 총표수

누가 어느 후보를 선택했는지는 연결되지 않게 저장됩니다.

## 5. GitHub Pages 배포

1. 이 저장소를 GitHub에 푸시합니다.
2. GitHub 저장소의 `Settings > Pages`로 이동합니다.
3. `Deploy from a branch`를 선택합니다.
4. 브랜치는 `main`, 폴더는 `/root`로 저장합니다.
5. 배포가 완료되면 아래 페이지를 사용합니다.
   - `https://YOUR_ID.github.io/REPO_NAME/`
   - `https://YOUR_ID.github.io/REPO_NAME/admin.html`

## 운영 메모

- 공개 시간 차단은 Supabase 함수에서 검사합니다.
- 등록된 이름만 투표할 수 있습니다.
- 같은 후보를 중복 선택하는 것은 허용하지 않습니다.
- 투표가 이미 들어온 뒤에는 기본 설정, 후보, 이름 목록 변경을 막아 두었습니다.
- 이번 버전으로 바꾸려면 Supabase에서 `schema.sql`을 다시 실행해야 합니다.
