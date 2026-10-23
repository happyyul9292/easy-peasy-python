# EasyPeasy Studio

**Easy to read. Powerful to build.**

EasyPeasy Studio는 EasyPeasy 코드를 작성·실행하고 여러 파일 프로젝트를 관리할 수 있는 웹 개발 환경입니다. 코드 편집기, 실행 콘솔, 문법 진단, 검색 참고 자료, 대화형 AI 도우미, 코드 수정 검토, AI 기반 언어 변환을 제공합니다.

## 필요한 환경

- Node.js 20 이상
- npm
- AI 기능을 사용할 경우 Google AI Studio API 키

## Windows에서 실행하기

1. ZIP을 압축 해제합니다.
2. 압축을 푼 `easypeasy-studio` 폴더에서 PowerShell을 엽니다.
3. 아래 명령어를 실행합니다.

```powershell
npm install
npm start
```

4. `.env` 파일에서 `GEMINI_API_KEY`에 본인의 API 키를 입력합니다.
5. 브라우저에서 `http://localhost:3000`을 엽니다.

```dotenv
GEMINI_API_KEY=여기에_본인_API_키
GEMINI_MODEL=gemini-3.8-flash
PORT=3000
```

실제 API 키를 GitHub에 올리거나 다른 사람에게 공유하지 마세요. `.env`는 저장소에 커밋하지 마세요.

## 포함된 기능

- Monaco 코드 편집기와 EasyPeasy 실행 콘솔
- 프로젝트 파일·폴더 생성, 이름 변경, 삭제 및 ZIP 내보내기
- 문법·API·코드 패턴을 포함한 **2,500개 이상의 검색 가능한 참고 항목**
- 검색 결과 예제 복사
- AI 코딩 도우미 채팅과 최근 대화 문맥 전달
- AI 코드 수정안의 비교, 적용, 되돌리기 및 확정
- 다른 언어의 코드를 AI 서버를 통해 EasyPeasy로 변환
- EasyPeasy 코드를 Python으로 변환하는 기능
- 현재 파일 코드 전체 지우기, 로고 클릭 새로고침, 모바일 하단 메뉴 간소화

## EasyPeasy 실행 문법 범위

현재 실행기는 의도적으로 제한된 문법을 사용합니다. 대표적으로 변수 대입, `print`, `input(ask(...))`, `if`/`else`, `repeat`, `for ... in range(...)`, 숫자·문자열·불리언·리스트, 기본 산술 및 비교 연산, 그리고 `length`, `first`, `last`, `sum`, `average`, `upsort`, `downsort`, `only_upper`, `only_lower`, `digits`, `letters`, `is_even`, `is_odd`, `random_int`, `random_choice`를 지원합니다.

도움말 검색에는 Python 표준 라이브러리와 일반적인 코드 패턴도 참고용으로 포함됩니다. **검색 결과에 나온 모든 Python 문법이나 API가 EasyPeasy 실행기에서 바로 실행된다는 뜻은 아닙니다.** 지원되지 않는 문법을 실행기에 추가하려면 인터프리터 구현도 함께 확장해야 합니다.

## AI 기능과 정확성

AI 기능은 `.env`의 API 키와 인터넷 연결이 필요합니다. AI가 만든 코드는 문법 검사를 거치고, 수정안은 검토 창에서 적용 여부를 선택할 수 있습니다. 다른 언어에서 EasyPeasy로 변환할 때도 변환 결과를 검토한 뒤 적용하세요.

정적 진단은 명백한 문법 문제를 찾는 데 도움을 주지만 모든 오류를 찾거나 오진을 완전히 없앨 수는 없습니다. 실제 실행과 테스트를 함께 사용하세요.

## 테스트

```powershell
npm test
```


## AI 응답 대기 시간

AI 요청의 서버 측 타임아웃은 600초(10분)로 설정되어 있습니다. 모델은 `gemini-3.8-flash`로 고정되어 있으며 다른 모델로 자동 전환하지 않습니다. 실제 사용 가능 여부는 Google AI API 계정과 해당 모델의 제공 상태에 따라 달라집니다. `.env`에 `GEMINI_API_KEY`를 입력하세요.
