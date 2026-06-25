# GitHub 배포 안내

대상 저장소:

```text
https://github.com/ShinJiEuN-N/watson-athlete-app.git
```

## 가장 쉬운 방법

1. GitHub 저장소 페이지를 엽니다.
2. `Add file > Upload files`를 누릅니다.
3. 이 폴더 안의 파일을 모두 업로드합니다.
   - `index.html`
   - `styles.css`
   - `app.js`
   - `manifest.webmanifest`
   - `.nojekyll`
   - `README.md`
4. `Commit changes`를 누릅니다.
5. `Settings > Pages`로 이동합니다.
6. `Deploy from a branch`를 선택합니다.
7. Branch는 `main`, folder는 `/root`로 설정합니다.

## Git이 설치된 PC에서 올리는 방법

```powershell
cd "C:\Users\dean9\Documents\Codex\2026-06-16\new-chat\outputs\watson-athlete-app"
git init
git branch -M main
git add .
git commit -m "Deploy WATSON Athlete app"
git remote add origin https://github.com/ShinJiEuN-N/watson-athlete-app.git
git push -u origin main
```

이미 원격 저장소에 파일이 있는 경우에는 아래처럼 먼저 받아온 뒤 올립니다.

```powershell
git pull origin main --allow-unrelated-histories
git push -u origin main
```
