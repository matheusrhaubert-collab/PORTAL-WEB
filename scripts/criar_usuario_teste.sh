#!/bin/bash
# Script para criar usuário de teste via Supabase Admin API (curl)
#
# Uso:
#   bash scripts/criar_usuario_teste.sh
#
# Ou no PowerShell (Windows):
#   powershell -ExecutionPolicy Bypass -File scripts/criar_usuario_teste.ps1

set -e

SUPABASE_URL="https://xkgffjxihauzzoccnaoe.supabase.co"
SERVICE_ROLE_KEY="${SERVICE_ROLE_KEY:-}"

# Email e senha de teste
EMAIL="teste@legno.local"
PASSWORD="Teste123!@#"

if [ -z "$SERVICE_ROLE_KEY" ]; then
  echo "❌ SERVICE_ROLE_KEY não definida!"
  echo ""
  echo "Como obter:"
  echo "1. Abra: https://app.supabase.com"
  echo "2. Selecione seu projeto"
  echo "3. Vá em Settings > API"
  echo "4. Copie a 'Service Role Secret'"
  echo ""
  echo "Como rodar:"
  echo "  SERVICE_ROLE_KEY=sua_chave bash scripts/criar_usuario_teste.sh"
  echo ""
  echo "Exemplo:"
  echo "  SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9... bash scripts/criar_usuario_teste.sh"
  exit 1
fi

echo "🔄 Criando usuário: $EMAIL"
echo ""

# Chamar Admin API do Supabase
RESPONSE=$(curl -s -X POST \
  "${SUPABASE_URL}/auth/v1/admin/users" \
  -H "Authorization: Bearer ${SERVICE_ROLE_KEY}" \
  -H "Content-Type: application/json" \
  -d "{
    \"email\": \"${EMAIL}\",
    \"password\": \"${PASSWORD}\",
    \"email_confirm\": true
  }")

echo "$RESPONSE" | grep -q '"id"' && {
  USER_ID=$(echo "$RESPONSE" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
  echo "✅ Usuário criado com sucesso!"
  echo "   User ID: $USER_ID"
  echo "   Email: $EMAIL"
  echo "   Senha: $PASSWORD"
  echo ""
  echo "🎉 Pronto! Você pode fazer login no portal."
} || {
  echo "❌ Erro ao criar usuário:"
  echo "$RESPONSE" | head -20
  exit 1
}
