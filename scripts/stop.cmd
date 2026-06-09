@echo off
powershell -ExecutionPolicy Bypass -Command ^
  "if (-not ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) { " ^
  "  Start-Process powershell -Verb RunAs -ArgumentList '-ExecutionPolicy Bypass -File \"%~dp0stop.ps1\"'; exit " ^
  "} else { " ^
  "  & '%~dp0stop.ps1' " ^
  "}"
