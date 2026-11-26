# herdr-x-mas-paper 작업 규칙

## 저장소

Herdr 레이아웃 `x-mas-paper`: 맨 위에 창가 선반의 스노우글로브 장면 띠, 그 아래에 탭 줄과 터미널, 오른쪽에 레일.

- `mods/x-mas-paper-scene` — 위쪽 장면 띠. 지금은 자리 표시다: 띠 전체를 팔레트의 바탕색으로 칠하고 가운데에 `scan.sh` 가 찾은 세션 수를 보여 준다. `scan.sh` 를 3 초마다 돌린다. 선반과 글로브 그림은 여기에 들어간다.
- `mods/x-mas-paper-rail` — 오른쪽 레일. 저장소별로 스페이스를 묶고, 스페이스마다 티켓 키와 에이전트 얼굴·주제·경과 시간을 그린다.
- `mods/x-mas-paper-accounts` — 사원증 배지. `cca` 로 Claude/Codex 계정과 사용량을 읽어 레일 아래에 세우고, 헤드의 사용량 게이지와 계정 팝업을 그린다.
- `mods/x-mas-paper-tabs` — 탭 줄. 30 px 행에 들어간다. 이름 없는 탭은 에이전트 세션 이름, 없으면 폴더 이름을 쓴다. Herdr 의 `tabs` mod 를 고친 것이다.
- `mods/x-mas-paper-pane` — 터미널 패널 헤더. Herdr 의 `pane` mod 를 고쳐 12 px 프레임에 맞췄다.
- `mods/x-mas-paper-editor` — `hv <file>` 로 여는 편집 패널.

화면 기준 문서는 `ui-assets/brief.md` 다.

## 설치와 테스트

```sh
tools/install.sh
node --import ./tests/stubs/register.mjs --test tests/
```

`tools/install.sh` 는 mod, `layouts/x-mas-paper.json`, `layouts/x-mas-paper.png`(있으면), 테마 둘을 `${HERDR_APP_HOME:-$HOME/.config/herdr-app}` 로 복사한다. `herdr-shared` 의 `cca`·`scan.sh`·`hv` 는 `vendor/herdr-shared` 서브모듈에서 `herdr-shared.list` 대로 사본을 만든다 (`sh vendor/herdr-shared/tools/vendor.sh --list .`).

## 미리보기 규칙 (herdr-* 저장소 공통)

이 절은 `~/git-repo/herdr-*` 저장소가 똑같이 싣는다. 한 곳에서 고치면 나머지 저장소의 같은 절도 같이 고친다.

- **레이아웃 선택 화면 그림.** 레이아웃이 있는 저장소는 `layouts/<name>.json` 루트에 `"preview": "layouts/<name>.png"` 를 두고 `layouts/<name>.png`(640×400)를 저장소에 싣는다. 필드나 그림 중 하나라도 없으면 Herdr 설정 화면에 빈 틀이 나온다 (`~/.config/herdr-app/AGENTS.md` 의 `preview` 항목).
- **설치는 JSON 과 PNG 를 같이 옮긴다.** 설치 스크립트와 README 의 복사 명령이 둘 다 옮기는지 확인한다. 설치본(`~/.config/herdr-app/layouts/`)에만 필드나 그림을 넣지 않는다. 다음 설치가 JSON 을 통째로 덮어써서 필드가 사라진다.
- **갤러리 그림.** herdr.dev 갤러리는 저장소 루트의 `preview.png` 를 보여 준다. 16:10(예: 2560×1600)으로 만들고, 선택 화면 그림은 같은 화면을 640×400 으로 줄여 쓴다.
- **공개되는 그림에는 지어낸 데모 데이터만 쓴다.** `preview.png`, `layouts/*.png`, README·docs 의 스크린샷과 GIF 가 대상이다. 화면 속 글은 전부 영어로 하고, 회사 업무가 드러나는 것이 보이지 않아야 한다: 티켓 키, 사내 저장소·서비스·채널 이름, 고객과 동료 이름, 실제 터미널 내용, 홈 경로의 계정 이름. 실제로 쓰는 창을 그대로 찍은 그림은 싣지 않는다.
- **모양을 바꾸면 같은 커밋에서 두 그림을 다시 만든다.** 커밋하기 전에 그림을 열어 위 항목을 눈으로 확인한다.

