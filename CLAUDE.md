# herdr-x-mas-paper 작업 규칙

## 저장소

Herdr 레이아웃 `x-mas-paper`: 맨 위에 종이 마을 장면 띠(스튜디오가 그린 장면 그림 한 장 위에 세션마다 집 하나), 그 아래에 탭 줄과 터미널, 오른쪽에 레일.

- `mods/x-mas-paper-scene` — 위쪽 장면 띠. 스튜디오가 그린 그림 한 장(`art/scene_<mode>.png`), 집별 상태 겹침 조각(`art/state_<state>_<mode>_h<id>.png`), 그 위의 조명(`lights_<mode>`)과 서서히 깜박이는 빛 무리 세 장(`blink_{1,2,3}_<mode>`, 0→1 ease-in-out 루프), 선택한 집의 모서리 괄호(`select_<corner>_<mode>`), 작업 중인 집의 굴뚝마다 회차마다 그림·높이·배율을 새로 뽑아 피어오르는 연기 뭉게 세 알(`puffs/puff_{p1..p4}_<mode>`), 작은 그림들, 그리고 자리·겹침 사각형·작은 그림 기준점을 담은 `slots.js` 로 그린다. 재료가 바뀌면 `uv run --with pillow python3 -I tools/build-scene-art.py <바탕재료폴더> [<덮어쓸재료폴더> ...]` 로 `art/` 와 `slots.js` 를 다시 만든다(파일마다 그 파일을 가진 마지막 폴더에서 읽는다). `scan.sh` 를 3 초마다 돌린다. `ctrl+opt+p` 로 장면이 키보드를 잡으면 ←→·⌥←→ 선택, ↩ 이동, Space/⇧Space 대기·안 읽은 세션, ⌫ 읽음, 타이핑 검색, ? 범례, Esc 단계, ⌘[/⌘] 방문 이력을 받는다. keys.json 의 `layout:x-mas-paper` 섹션(`tools/keys-section.txt`)이 있어야 첫 세 명령이 닿는다.
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

`tools/install.sh` 는 mod, `layouts/x-mas-paper.json`, `layouts/x-mas-paper.png`(있으면), 테마 둘을 `${HERDR_APP_HOME:-$HOME/.config/herdr-app}` 로 복사한다. `herdr-shared` 의 `cca`·`scan.sh`·`hv` 는 `vendor/herdr-shared` 서브모듈에서 `herdr-shared.list` 대로 사본을 만든다 (`sh vendor/herdr-shared/tools/vendor.sh --list .`). keys.json 은 사람의 파일이라 고치지 않고, `layout:x-mas-paper` 섹션이 없으면 `tools/keys-section.txt` 를 붙이라고 안내만 한다.

## 그림 다시 만들기

```sh
tools/preview/render.sh
```

`preview.png`(2560×1600, 밝은 그림과 어두운 그림을 대각선으로 합친 것)와 `layouts/x-mas-paper.png`(640×400, 밝은 그림)를 다시 만든다. macOS 와 `/Applications/Google Chrome.app` 이 필요하고(`CHROME` 으로 경로를 바꾼다), 화면이 잠겨 있거나 미리보기 창이 이미 떠 있거나 창 위에 알림·대화상자가 있으면 아무것도 쓰지 않고 멈춘다.

- `tools/preview/build-layout.py` 가 `layouts/x-mas-paper.json` 을 그림용으로 고친다: 장면·레일·계정·탭 블록에 `props.demo` 를 넣고, 터미널 블록을 `tools/preview/mods/x-mas-paper-demo-term` 로 바꾼다.
- 지어낸 데모 데이터는 `mods/x-mas-paper-scene/demo.js`, `mods/x-mas-paper-rail/demo.js`, `mods/x-mas-paper-accounts/demo.js`, `mods/x-mas-paper-tabs/main.js` 의 `DEMO_SPACE`, `tools/preview/mods/x-mas-paper-demo-term/main.js` 에 있다.
- `main.js` 가 불러오는 모듈(`demo.js`·`scene.js` 등)은 떠 있는 미리보기 창이 새로 읽지 않는다. 그런 모듈만 고쳤으면 `tools/preview.sh stop` 으로 닫고 다시 띄운다.

## 미리보기 규칙 (herdr-* 저장소 공통)

이 절은 `~/git-repo/herdr-*` 저장소가 똑같이 싣는다. 한 곳에서 고치면 나머지 저장소의 같은 절도 같이 고친다.

- **레이아웃 선택 화면 그림.** 레이아웃이 있는 저장소는 `layouts/<name>.json` 루트에 `"preview": "layouts/<name>.png"` 를 두고 `layouts/<name>.png`(640×400)를 저장소에 싣는다. 필드나 그림 중 하나라도 없으면 Herdr 설정 화면에 빈 틀이 나온다 (`~/.config/herdr-app/AGENTS.md` 의 `preview` 항목).
- **설치는 JSON 과 PNG 를 같이 옮긴다.** 설치 스크립트와 README 의 복사 명령이 둘 다 옮기는지 확인한다. 설치본(`~/.config/herdr-app/layouts/`)에만 필드나 그림을 넣지 않는다. 다음 설치가 JSON 을 통째로 덮어써서 필드가 사라진다.
- **갤러리 그림.** herdr.dev 갤러리는 저장소 루트의 `preview.png` 를 보여 준다. 16:10(예: 2560×1600)으로 만들고, 선택 화면 그림은 같은 화면을 640×400 으로 줄여 쓴다.
- **공개되는 그림에는 지어낸 데모 데이터만 쓴다.** `preview.png`, `layouts/*.png`, README·docs 의 스크린샷과 GIF 가 대상이다. 화면 속 글은 전부 영어로 하고, 회사 업무가 드러나는 것이 보이지 않아야 한다: 티켓 키, 사내 저장소·서비스·채널 이름, 고객과 동료 이름, 실제 터미널 내용, 홈 경로의 계정 이름. 실제로 쓰는 창을 그대로 찍은 그림은 싣지 않는다.
- **모양을 바꾸면 같은 커밋에서 두 그림을 다시 만든다.** 커밋하기 전에 그림을 열어 위 항목을 눈으로 확인한다.

