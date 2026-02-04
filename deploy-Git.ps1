# Налаштування Git для цього проєкту
$GITHUB_USERNAME = "shlifservice24-lang"
$GITHUB_REPO = "Shlif_service"
$GITHUB_EMAIL = "shlifservice24@gmail.com"

$ErrorActionPreference = "Stop"
$Root = $PSScriptRoot
Set-Location -LiteralPath $Root

Write-Host "========================================"
Write-Host "  Auto Deploy: Git Push -> GitHub Pages"
Write-Host "  Repo: $GITHUB_USERNAME/$GITHUB_REPO"
Write-Host "========================================"
Write-Host ""

# 0. Перевірка та налаштування remote
Write-Host "[0/5] Checking Git remote configuration..."
$currentRemote = git remote get-url origin 2>$null
$expectedRemote = "https://github.com/$GITHUB_USERNAME/$GITHUB_REPO.git"

if ($currentRemote -ne $expectedRemote) {
    Write-Host "Updating remote from: $currentRemote" -ForegroundColor Yellow
    Write-Host "                  to: $expectedRemote" -ForegroundColor Green
    git remote set-url origin $expectedRemote
}
Write-Host "Remote configured: $expectedRemote" -ForegroundColor Green

# 1. Налаштування Git user
Write-Host "[1/5] Configuring Git user..."
git config user.name $GITHUB_USERNAME
git config user.email $GITHUB_EMAIL
Write-Host "Git user: $GITHUB_USERNAME <$GITHUB_EMAIL>" -ForegroundColor Green

# 2. GitHub Login
Write-Host "[2/5] Logging into GitHub..."
git credential-manager github login
if ($LASTEXITCODE -ne 0) {
    Write-Host "GitHub login skipped or failed. Trying to continue..." -ForegroundColor Yellow
}
Write-Host "GitHub login complete!" -ForegroundColor Green

$timestamp = Get-Date -Format "yyyy-MM-dd HH:mm"

# 3. Build
Write-Host "[3/5] Building for GitHub Pages..."
npm run build
if ($LASTEXITCODE -ne 0) {
    Write-Host "BUILD FAILED! Fixing required before deploy." -ForegroundColor Red
    exit 1
}
Write-Host "Build Success!" -ForegroundColor Green

# 4. Git Commit and Push (force)
Write-Host "[4/5] Pushing to GitHub (force)..."
git add -A
git commit --allow-empty -m "deploy: $timestamp"
git push --force origin main
if ($LASTEXITCODE -ne 0) {
    Write-Host "Push failed!" -ForegroundColor Red
    Write-Host "Hint: Make sure the repository exists: https://github.com/$GITHUB_USERNAME/$GITHUB_REPO" -ForegroundColor Yellow
    Write-Host "Hint: Run 'git credential-manager github logout' and try again" -ForegroundColor Yellow
    exit 1
}
Write-Host "Pushed to GitHub!" -ForegroundColor Green

# 5. Deploy to GitHub Pages
Write-Host "[5/5] Deploying to GitHub Pages..."
npm run deploy
if ($LASTEXITCODE -ne 0) {
    Write-Host "GitHub Pages deploy failed!" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "========================================"
Write-Host "  DEPLOYMENT COMPLETE"
Write-Host "  https://$GITHUB_USERNAME.github.io/$GITHUB_REPO/"
Write-Host "========================================"
