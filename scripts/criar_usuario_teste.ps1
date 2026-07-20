# Script PowerShell para criar usuário de teste via Supabase Admin API
#
# Uso no PowerShell:
#   $env:SERVICE_ROLE_KEY = "sua_chave_aqui"
#   .\scripts\criar_usuario_teste.ps1
#
# Ou em uma linha:
#   $env:SERVICE_ROLE_KEY="sua_chave"; .\scripts\criar_usuario_teste.ps1

$SUPABASE_URL = "https://xkgffjxihauzzoccnaoe.supabase.co"
$SERVICE_ROLE_KEY = $env:SERVICE_ROLE_KEY

# Email e senha de teste
$EMAIL = "teste@legno.local"
$PASSWORD = "Teste123!@#"

if ([string]::IsNullOrEmpty($SERVICE_ROLE_KEY)) {
    Write-Host "❌ SERVICE_ROLE_KEY não definida!" -ForegroundColor Red
    Write-Host ""
    Write-Host "Como obter:" -ForegroundColor Yellow
    Write-Host "1. Abra: https://app.supabase.com"
    Write-Host "2. Selecione seu projeto"
    Write-Host "3. Vá em Settings > API"
    Write-Host "4. Copie a 'Service Role Secret'"
    Write-Host ""
    Write-Host "Como rodar:" -ForegroundColor Yellow
    Write-Host '  $env:SERVICE_ROLE_KEY = "sua_chave_aqui"'
    Write-Host '  .\scripts\criar_usuario_teste.ps1'
    Write-Host ""
    Write-Host "Ou em uma linha:" -ForegroundColor Yellow
    Write-Host '  $env:SERVICE_ROLE_KEY="sua_chave"; .\scripts\criar_usuario_teste.ps1'
    exit 1
}

Write-Host "🔄 Criando usuário: $EMAIL" -ForegroundColor Cyan
Write-Host ""

# Preparar body do request
$body = @{
    email = $EMAIL
    password = $PASSWORD
    email_confirm = $true
} | ConvertTo-Json

# Chamar Admin API do Supabase
try {
    $response = Invoke-WebRequest -Uri "$SUPABASE_URL/auth/v1/admin/users" `
        -Method Post `
        -Headers @{
            "Authorization" = "Bearer $SERVICE_ROLE_KEY"
            "Content-Type" = "application/json"
        } `
        -Body $body `
        -ErrorAction Stop

    $data = $response.Content | ConvertFrom-Json
    $userId = $data.id

    Write-Host "✅ Usuário criado com sucesso!" -ForegroundColor Green
    Write-Host "   User ID: $userId"
    Write-Host "   Email: $EMAIL"
    Write-Host "   Senha: $PASSWORD"
    Write-Host ""
    Write-Host "🎉 Pronto! Você pode fazer login no portal." -ForegroundColor Green

} catch {
    Write-Host "❌ Erro ao criar usuário:" -ForegroundColor Red
    Write-Host $_.Exception.Message
    exit 1
}
