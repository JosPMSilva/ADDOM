@echo off
set NAME=%~1
if "%NAME%"=="" set NAME=fixture
echo hello %NAME%
