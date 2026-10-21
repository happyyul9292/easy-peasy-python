# EasyPeasy Studio

**Easy to read. Powerful to build.**

EasyPeasy Studio는 EasyPeasy 문법을 시험해 볼 수 있는 웹 IDE MVP입니다. Monaco 기반 편집기, 기초 진단 표시, 작은 인터프리터, 실행 콘솔, 입력 패널, Gemini API 기반 코드 수정 제안을 포함합니다.

> 중요: 이 ZIP은 실제 실행 가능한 출발점이지만, 전 세계적으로 인정받을 완성형 언어/VS Code 대체품은 아닙니다. 현재 인터프리터는 의도적으로 제한된 문법만 구현합니다. 아래 지원 범위를 확인하세요.

## 요구 사항

- Node.js 20 이상
- npm
- Gemini 기능을 사용하려면 Google Gemini API 키

## Windows 설치 및 실행

1. ZIP 압축을 풉니다.
2. 해당 폴더에서 명령 프롬프트 또는 PowerShell을 엽니다.
3. 의존성을 설치합니다.

```powershell
npm install
```

4. `.env.example`을 복사해 `.env` 파일을 만듭니다.

```powershell
Copy-Item .env.example .env
```

5. `.env`를 메모장으로 열어 키를 입력합니다.

```dotenv
GEMINI_API_KEY=여기에_실제_Gemini_API_키
GEMINI_MODEL=gemini-2.5-flash
PORT=3000
```

`gemini-2.5-flash`가 계정에서 지원되지 않는 경우 Google AI Studio의 최신 모델 목록을 확인하고 `GEMINI_MODEL` 값을 변경하세요. 키는 절대 GitHub에 올리지 마세요.

6. 서버를 실행합니다.

```powershell
npm start
```

7. 브라우저에서 http://localhost:3000 을 엽니다.

개발 모드(파일 변경 시 재시작):

```powershell
npm run dev
```

## macOS / Linux

```bash
npm install
cp .env.example .env
```

`.env`에 API 키를 넣은 다음:

```bash
npm start
```

브라우저에서 `http://localhost:3000`을 엽니다.

## 현재 구현된 EasyPeasy 문법

- 변수 대입: `age = 13`
- 문자열/숫자/불리언/none
- `print(...)`
- `input(ask("질문"))` 및 `input("질문")` — 실행 패널의 입력값을 순서대로 사용
- 리스트 리터럴
- 기본 산술/비교/and/or
- `if ...:` 및 `else:`
- `repeat N:`
- `for name in range(start, stop):`
- `length`, `first`, `last`, `sum`, `average`
- `upsort`, `downsort`
- `only_upper`, `only_lower`, `digits`, `letters`
- `is_even`, `is_odd`, `random_int`, `random_choice`

아직 완성되지 않은 기능에는 함수 선언, 클래스, 사전/딕셔너리 실행, 파일 API, 완전한 파서 기반 진단, 진짜 단계별 디버거, 다중 파일 프로젝트, 완전한 Python 호환성 등이 있습니다. 도움말 목록은 현재 MVP에 맞춰져 있습니다.

## Gemini AI 도우미

AI 도우미는 `/api/ai`에서 Gemini API를 호출합니다. 브라우저에는 API 키가 전달되지 않습니다.

필수 환경 변수:

- `GEMINI_API_KEY`: 비밀 API 키
- `GEMINI_MODEL`: 사용 가능한 Gemini 모델 ID
- `PORT`: 서버 포트(Render에서는 Render가 제공하는 포트를 사용)

AI가 코드 수정안을 반환하면 차이 비교 창이 열립니다. **편집기에 적용**을 누르면 실제 편집기 내용이 변경되고, **되돌리기** 또는 **확인**을 선택할 수 있습니다. 현재 MVP의 수정 트랜잭션은 브라우저 메모리 기반이며, 새로고침 후에도 유지되는 영속 트랜잭션 기록은 구현되지 않았습니다.

## 테스트

```bash
npm test
```

## GitHub에 올리기

1. GitHub에서 새 저장소를 만듭니다.
2. 터미널에서 프로젝트 폴더로 이동합니다.
3. `.gitignore`에 `.env`가 포함되어 있는지 확인합니다.

```bash
git init
git add .
git commit -m "Initial EasyPeasy Studio"
git branch -M main
git remote add origin YOUR_GITHUB_REPOSITORY_URL
git push -u origin main
```

`YOUR_GITHUB_REPOSITORY_URL`을 실제 GitHub 저장소 주소로 바꿉니다. `.env` 파일은 추가하지 마세요.

## Render에 배포하기

1. Render 계정에 로그인합니다.
2. **New + → Web Service**를 선택합니다.
3. GitHub 저장소를 연결합니다.
4. Runtime은 Node를 선택합니다.
5. Build Command를 `npm install`로 설정합니다.
6. Start Command를 `npm start`로 설정합니다.
7. Environment Variables에 다음을 추가합니다.
   - `GEMINI_API_KEY` = 실제 키
   - `GEMINI_MODEL` = 지원되는 Gemini 모델 ID
8. 배포 후 Render가 제공하는 URL을 엽니다.
9. `/api/health`를 열어 서버가 응답하는지 확인합니다.

Render가 제공하는 `PORT`를 앱이 자동으로 사용합니다. 실제 API 키를 GitHub에 저장하지 마세요.

## 보안 한계

이 MVP 인터프리터는 별도 OS 컨테이너가 아닌 Node.js 프로세스 내부에서 실행됩니다. 임의의 호스트 코드 실행은 하지 않지만, 이것을 다중 사용자 공개 서비스용 완전한 샌드박스로 간주해서는 안 됩니다. 공개 배포 전에 별도 격리된 실행 워커, 자원 제한, 요청 제한, 네트워크 정책, 보안 테스트를 추가해야 합니다.

## 라이선스

필요에 맞는 라이선스를 검토한 뒤 프로젝트 배포 전에 LICENSE 파일을 추가하세요.


## Updated build notes

- Create `.env` from `.env.example` and set a **new** Google AI Studio API key.
- The default model is `gemini-2.5-flash`. If a configured model name returns 404, the server retries with this fallback.
- AI requests have a 90-second timeout and return readable API error details.
- The editor now flags unmatched/unclosed parentheses, brackets, and braces, and the Problems panel can navigate to diagnostic lines.
- Program inputs are requested one at a time directly in the terminal/output panel; the separate bulk-input panel was removed.
- Added a Python conversion draft button, file rename via right-click, and right-side panel collapse.
- The Python conversion is a best-effort draft, not a complete transpiler. This MVP still has a single active source file and its help index documents supported EasyPeasy syntax rather than claiming to contain 1,000 fully implemented language features.


## Updated Studio features

- Multi-file and folder entries in the explorer (session-based browser project).
- Right-click file/folder actions: rename and delete; files can be downloaded individually.
- Export one-file projects as a source file and multi-file projects as a ZIP archive.
- Python reference search with copy buttons, including built-ins, common methods, standard-library APIs, syntax examples, and practical templates.
- Python conversion displays the result in the output panel and attempts to copy the converted code.
- Runtime expression parsing no longer splits names such as `scores` at the `or` substring; unmatched quotes and brackets are diagnosed.

Files and folders created in the explorer are kept in the current browser session; export the project ZIP before refreshing the page to preserve those changes. The Python converter is a best-effort draft converter, not a complete compiler for every EasyPeasy construct.
