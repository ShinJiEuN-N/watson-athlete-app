# WATSON Athlete

선수의 HRV와 보행 균형을 측정해 경기 준비도를 보여주는 모바일 웹앱입니다.

## 기능

- 선수명, 등번호, 포지션 입력
- 카메라 기반 HRV 추정
- 모션 센서 기반 보행 균형 측정
- 경기 준비도, 회복도, 피로도, 좌우 균형, 리듬 지표 표시
- 브라우저 localStorage에 최근 결과 저장
- 센서가 없는 PC 환경에서 데모 측정 지원

## GitHub Pages 배포

1. GitHub에서 새 저장소를 만듭니다.
2. 이 폴더의 파일을 저장소 루트에 업로드합니다.
3. 저장소 `Settings > Pages`로 이동합니다.
4. `Deploy from a branch`를 선택합니다.
5. Branch는 `main`, folder는 `/root`로 선택합니다.
6. 배포 URL에서 `index.html`이 열리는지 확인합니다.

## 주의

- 카메라와 모션 센서는 HTTPS 환경에서 가장 안정적으로 동작합니다.
- GitHub Pages는 HTTPS를 제공하므로 실제 모바일 테스트에 적합합니다.
- iPhone에서는 보행 측정 전 모션 센서 권한 승인이 필요합니다.
