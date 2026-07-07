# redeploy-functions.ps1
# Redeploys the updated edge functions to Supabase

Write-Host "`nRedeploying edge functions..." -ForegroundColor Cyan

supabase functions deploy send-push --project-ref lwycqwmnfkimrwjycsgc
supabase functions deploy daily-reminder --project-ref lwycqwmnfkimrwjycsgc
supabase functions deploy notify-challenge --project-ref lwycqwmnfkimrwjycsgc

Write-Host "`nDone! Check Supabase Dashboard > Edge Functions > Logs for any errors." -ForegroundColor Green
Write-Host "Also verify your secrets at: https://supabase.com/dashboard/project/lwycqwmnfkimrwjycsgc/settings/functions" -ForegroundColor Yellow
Write-Host "`nVAPID_PUBLIC_KEY must exactly match:" -ForegroundColor Yellow
Write-Host "BHEoqxsJhxhg8Ub-WqtOZmtZhKuuO9Yb4hhPvKRW8dtt0uWnR5lCVhBJbiHLXIyjIhI2bP9dnKDwDWszq2YPr3Y" -ForegroundColor White
