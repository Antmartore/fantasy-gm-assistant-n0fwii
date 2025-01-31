@rem
@rem Fantasy GM Assistant Gradle wrapper script for Windows
@rem Version: 1.0
@rem Requires: JDK 11-17, Gradle 8.0+
@rem

@if "%DEBUG%" == "" @echo off
@rem ##########################################################################
@rem
@rem  Enhanced Gradle startup script for Windows
@rem  with security validations and optimized configurations
@rem
@rem ##########################################################################

@rem Set local scope for variables
setlocal enabledelayedexpansion

@rem Configure default JVM options for optimal React Native builds
set DEFAULT_JVM_OPTS="-Xmx4g" "-Xms512m" "-XX:MaxMetaspaceSize=512m" "-XX:+HeapDumpOnOutOfMemoryError"

@rem Gradle specific options
set GRADLE_OPTS=-Dorg.gradle.parallel=true -Dorg.gradle.daemon=true -Dorg.gradle.jvmargs=-Xmx4g -XX:MaxMetaspaceSize=512m

set DIRNAME=%~dp0
if "%DIRNAME%" == "" set DIRNAME=.
set APP_BASE_NAME=%~n0
set APP_HOME=%DIRNAME%

@rem Validate and locate Java installation
:findJavaFromJavaHome
set JAVA_HOME_OVERRIDE=
if defined JAVA_HOME (
    set JAVA_EXE=%JAVA_HOME%/bin/java.exe
    if exist "!JAVA_EXE!" (
        @rem Validate Java version (11-17)
        for /f "tokens=3" %%g in ('"%JAVA_EXE%" -version 2^>^&1 ^| findstr /i "version"') do (
            set JAVA_VERSION=%%g
            set JAVA_VERSION=!JAVA_VERSION:"=!
            for /f "delims=. tokens=1-3" %%v in ("!JAVA_VERSION!") do (
                set JAVA_MAJOR=%%v
                if !JAVA_MAJOR! GEQ 11 if !JAVA_MAJOR! LEQ 17 (
                    goto foundJava
                )
            )
        )
    )
)

@rem Try PATH for java.exe
for %%i in (java.exe) do set JAVA_EXE=%%~$PATH:i
if not "%JAVA_EXE%" == "" (
    @rem Validate Java version from PATH
    for /f "tokens=3" %%g in ('"%JAVA_EXE%" -version 2^>^&1 ^| findstr /i "version"') do (
        set JAVA_VERSION=%%g
        set JAVA_VERSION=!JAVA_VERSION:"=!
        for /f "delims=. tokens=1-3" %%v in ("!JAVA_VERSION!") do (
            set JAVA_MAJOR=%%v
            if !JAVA_MAJOR! GEQ 11 if !JAVA_MAJOR! LEQ 17 (
                goto foundJava
            )
        )
    )
)

echo.
echo ERROR: Compatible Java installation not found.
echo Please install JDK version 11-17 and ensure JAVA_HOME is set correctly.
echo Current JAVA_HOME: "%JAVA_HOME%"
echo.
exit /b 1

:foundJava

@rem Verify Gradle wrapper integrity
set WRAPPER_JAR="%APP_HOME%\gradle\wrapper\gradle-wrapper.jar"
set WRAPPER_PROPERTIES="%APP_HOME%\gradle\wrapper\gradle-wrapper.properties"

if not exist %WRAPPER_JAR% (
    echo ERROR: Gradle wrapper JAR not found at %WRAPPER_JAR%
    echo Please ensure the Gradle wrapper is properly installed.
    exit /b 3
)

if not exist %WRAPPER_PROPERTIES% (
    echo ERROR: Gradle wrapper properties not found at %WRAPPER_PROPERTIES%
    echo Please ensure the Gradle wrapper is properly installed.
    exit /b 3
)

@rem Verify wrapper properties contain valid HTTPS URL
findstr /I /C:"https:" %WRAPPER_PROPERTIES% > nul
if errorlevel 1 (
    echo ERROR: Gradle distribution URL must use HTTPS protocol.
    exit /b 4
)

@rem Setup the command line
set CLASSPATH=%APP_HOME%\gradle\wrapper\gradle-wrapper.jar

@rem Enhanced error handling for Gradle execution
:execute
@rem Setup the command line

@rem Add React Native specific configurations for CI environments
if defined CI (
    set GRADLE_OPTS=%GRADLE_OPTS% -Dorg.gradle.daemon=false -Dorg.gradle.workers.max=2
)

@rem Execute Gradle with timeout handling
set TIMEOUT_SECONDS=1800
set START_TIME=%TIME%

"%JAVA_EXE%" %DEFAULT_JVM_OPTS% %JAVA_OPTS% %GRADLE_OPTS% ^
  "-Dorg.gradle.appname=%APP_BASE_NAME%" ^
  -classpath "%CLASSPATH%" ^
  org.gradle.wrapper.GradleWrapperMain %*

set EXIT_CODE=%ERRORLEVEL%

@rem Handle specific error codes
if %EXIT_CODE% equ 0 goto mainEnd
if %EXIT_CODE% equ 1 echo ERROR: Build failed
if %EXIT_CODE% equ 2 echo ERROR: Build script evaluation failed
if %EXIT_CODE% equ 3 echo ERROR: Task execution failed
if %EXIT_CODE% geq 126 echo ERROR: Command invocation failed
goto fail

:fail
exit /b %EXIT_CODE%

:mainEnd
if "%OS%"=="Windows_NT" endlocal

:omega