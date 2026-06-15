@echo off
powershell -ExecutionPolicy Bypass -File "%~dp0prepare-ad.ps1" %*
