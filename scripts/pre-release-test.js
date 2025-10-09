#!/usr/bin/env node

/**
 * Pre-release test execution script
 * This script runs all tests and generates detailed reports
 */

const { execSync } = require('child_process')
const fs = require('fs')
const path = require('path')

const colors = {
	green: '\x1b[32m',
	red: '\x1b[31m',
	yellow: '\x1b[33m',
	blue: '\x1b[34m',
	reset: '\x1b[0m',
	bold: '\x1b[1m'
}

function log(message, color = colors.reset)
{
	console.log(`${color}${message}${colors.reset}`)
}

function section(title)
{
	log(`\n${colors.bold}${colors.blue}=== ${title} ===${colors.reset}`)
}

function success(message)
{
	log(`✅ ${message}`, colors.green)
}

function error(message)
{
	log(`❌ ${message}`, colors.red)
}

function warning(message)
{
	log(`⚠️  ${message}`, colors.yellow)
}

function runCommand(command, description)
{
	try
	{
		log(`\n${colors.yellow}Running: ${command}${colors.reset}`)
		const output = execSync(command, { encoding: 'utf8', stdio: 'pipe' })
		success(`${description} completed successfully`)
		return { success: true, output }
	} catch (err)
	{
		error(`${description} failed`)
		if (err.stdout) log(err.stdout)
		if (err.stderr) log(err.stderr)
		return { success: false, error: err }
	}
}

async function main()
{
	log(`${colors.bold}${colors.blue}Data Gateway - Pre-release Test Suite${colors.reset}`)
	log(`Start time: ${new Date().toLocaleString()}\n`)

	const results = {
		passed: 0,
		failed: 0,
		details: []
	}

	// 1. Check Node.js version
	section('Environment Check')
	const nodeVersion = process.version
	log(`Node.js version: ${nodeVersion}`)

	const majorVersion = parseInt(nodeVersion.slice(1).split('.')[0])
	if (majorVersion >= 18)
	{
		success('Node.js version meets requirements (>=18.0.0)')
		results.passed++
	} else
	{
		error(`Node.js version too old, requires >=18.0.0, current: ${nodeVersion}`)
		results.failed++
		results.details.push('Node.js version requirement not met')
	}

	// 2. Check dependencies
	section('Dependencies Check')
	const packageJsonPath = path.join(__dirname, '../package.json')
	if (fs.existsSync(packageJsonPath))
	{
		const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'))
		log(`Package version: ${packageJson.version}`)
		success('package.json exists and format is correct')
		results.passed++
	} else
	{
		error('package.json does not exist')
		results.failed++
		results.details.push('package.json missing')
	}

	// 3. TypeScript compilation check
	section('TypeScript Compilation')
	const compileResult = runCommand('npx tsc --noEmit', 'TypeScript compilation check')
	if (compileResult.success)
	{
		results.passed++
	} else
	{
		results.failed++
		results.details.push('TypeScript compilation failed')
	}

	// 4. Code style check (if ESLint is configured)
	section('Code Style Check')
	if (fs.existsSync(path.join(__dirname, '../.eslintrc.js')) ||
		fs.existsSync(path.join(__dirname, '../.eslintrc.json')))
	{
		const lintResult = runCommand('npx eslint src --ext .ts', 'ESLint check')
		if (lintResult.success)
		{
			results.passed++
		} else
		{
			results.failed++
			results.details.push('ESLint check failed')
		}
	} else
	{
		warning('ESLint configuration not found, skipping code style check')
	}

	// 5. Unit tests execution
	section('Unit Tests')
	const testResult = runCommand('npm run test:run', 'Unit tests')
	if (testResult.success)
	{
		results.passed++
		// Try to parse test results
		if (testResult.output.includes('✓') || testResult.output.includes('passed'))
		{
			success('All unit tests passed')
		}
	} else
	{
		results.failed++
		results.details.push('Unit tests failed')
	}

	// 6. Test coverage check
	section('Test Coverage')
	const coverageResult = runCommand('npm run coverage', 'Test coverage analysis')
	if (coverageResult.success)
	{
		results.passed++

		// Try to parse coverage report
		const coverageReportPath = path.join(__dirname, '../coverage/coverage-summary.json')
		if (fs.existsSync(coverageReportPath))
		{
			try
			{
				const coverage = JSON.parse(fs.readFileSync(coverageReportPath, 'utf8'))
				const totalCoverage = coverage.total

				log(`\nCoverage report:`)
				log(`- Statement coverage: ${totalCoverage.statements.pct}%`)
				log(`- Branch coverage: ${totalCoverage.branches.pct}%`)
				log(`- Function coverage: ${totalCoverage.functions.pct}%`)
				log(`- Line coverage: ${totalCoverage.lines.pct}%`)

				if (totalCoverage.statements.pct >= 80)
				{
					success('Test coverage is good (>=80%)')
				} else
				{
					warning(`Test coverage is low: ${totalCoverage.statements.pct}% (recommended >=80%)`)
				}
			} catch (err)
			{
				warning('Unable to parse coverage report')
			}
		}
	} else
	{
		results.failed++
		results.details.push('Test coverage analysis failed')
	}

	// 7. Build check
	section('Build Check')
	const buildResult = runCommand('npm run build', 'Project build')
	if (buildResult.success)
	{
		results.passed++

		// Check build artifacts
		const distPath = path.join(__dirname, '../dist')
		if (fs.existsSync(distPath))
		{
			const distFiles = fs.readdirSync(distPath)
			if (distFiles.includes('index.js') && distFiles.includes('index.d.ts'))
			{
				success('Build artifacts are complete (index.js, index.d.ts)')
			} else
			{
				warning('Build artifacts may be incomplete')
			}
		}
	} else
	{
		results.failed++
		results.details.push('Build failed')
	}

	// 8. Package size check
	section('Package Size Check')
	if (fs.existsSync(path.join(__dirname, '../dist')))
	{
		try
		{
			const sizeResult = runCommand('du -sh dist', 'Package size check')
			if (sizeResult.success)
			{
				log(`Build artifact size: ${sizeResult.output.trim()}`)
				results.passed++
			}
		} catch (err)
		{
			warning('Unable to check package size')
		}
	}

	// 9. Documentation check
	section('Documentation Check')
	const requiredFiles = ['README.md', 'LICENSE']
	let docScore = 0

	for (const file of requiredFiles)
	{
		const filePath = path.join(__dirname, `../${file}`)
		if (fs.existsSync(filePath))
		{
			success(`${file} exists`)
			docScore++
		} else
		{
			error(`${file} does not exist`)
		}
	}

	if (docScore === requiredFiles.length)
	{
		results.passed++
	} else
	{
		results.failed++
		results.details.push('Required documentation files missing')
	}

	// 10. Git status check
	section('Git Status Check')
	try
	{
		const gitStatus = execSync('git status --porcelain', { encoding: 'utf8' })
		if (gitStatus.trim() === '')
		{
			success('Git working directory is clean')
			results.passed++
		} else
		{
			warning('Git working directory has uncommitted changes')
			log('Uncommitted files:')
			log(gitStatus)
		}
	} catch (err)
	{
		warning('Unable to check Git status (may not be in a Git repository)')
	}

	// Results summary
	section('Test Results Summary')
	log(`Total test items: ${results.passed + results.failed}`)
	log(`Passed: ${results.passed}`, results.passed > 0 ? colors.green : colors.reset)
	log(`Failed: ${results.failed}`, results.failed > 0 ? colors.red : colors.reset)

	if (results.failed === 0)
	{
		log(`\n${colors.bold}${colors.green}🎉 All checks passed! Project is ready for release.${colors.reset}`)
		process.exit(0)
	} else
	{
		log(`\n${colors.bold}${colors.red}❌ ${results.failed} checks failed, please fix before release.${colors.reset}`)

		if (results.details.length > 0)
		{
			log('\nFailure details:')
			results.details.forEach(detail =>
			{
				log(`- ${detail}`, colors.red)
			})
		}

		process.exit(1)
	}
}

main().catch(err =>
{
	console.error('Test script execution error:', err)
	process.exit(1)
})