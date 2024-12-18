const express = require('express')
const cors = require('cors')
require('dotenv').config()
const http = require('http')
const mysql = require('mysql2/promise')
const memberstackAdmin = require('@memberstack/admin')
const rateLimit = require('express-rate-limit')

const QuantaFTT = require('./QuantaFTT.js')

const app = express()
app.use(express.json())
app.use(
	cors({
		origin: [
			'https://q-testing.webflow.io',
			'https://quanta.world',
			'https://www.quanta.world',
			'http://localhost:63342',
		],
		methods: ['GET', 'POST'],
		allowedHeaders: ['content-type'],
	})
)
app.use(
	rateLimit({
		windowMs: 15 * 60 * 1000, // 15 minutes
		max: 50, // Limit each IP to 100 requests per windowMs
		message:
			'Too many requests from this IP, please try again after 15 minutes',
	})
)

const memberstack = memberstackAdmin.init(process.env.MS_KEY)

const pool = mysql.createPool({
	host: process.env.DB_HOST,
	user: process.env.DB_USER,
	password: process.env.DB_PASSWORD,
	database: process.env.DB_NAME,
	connectionLimit: 10,
})

async function loadContentFromURL(url) {
	try {
		const response = await fetch(url)
		if (!response.ok) {
			throw new Error(`HTTP error! Status: ${response.status}`)
		}
		const content = await response.text() // Reads the response as plain text
		return content
	} catch (error) {
		console.error('Failed to load content from URL:', error)
		return null // Handle the error appropriately
	}
}

let quantaFTT = null

async function initialize() {
	try {
		const sanityCheckerUrl = process.env.SANITY_CHECKER_INSTRUCTIONS
		const solutionRefinerUrl = process.env.SOLUTION_REFINER_INSTRUCTIONS
		const validityInstructionUrl = process.env.VALIDITY_INSTRUCTIONS
		const qualityInstructionUrl = process.env.QUALITY_INSTRUCTIONS
		const feedbackCleanerUrl = process.env.FEEDBACK_CLEANER_INSTRUCTIONS

		const cotShotsSanityUrl = process.env.COT_SHOTS_SANITY_CHECKER
		const cotShotsQualityUrl = process.env.COT_SHOTS_QUALITY_CHECKER
		const cotShotsValidityUrl = process.env.COT_SHOTS_VALIDITY

		// Ensure all environment variables are set
		if (
			!sanityCheckerUrl ||
			!solutionRefinerUrl ||
			!validityInstructionUrl ||
			!qualityInstructionUrl ||
			!feedbackCleanerUrl ||
			!cotShotsSanityUrl ||
			!cotShotsQualityUrl ||
			!cotShotsValidityUrl
		) {
			throw new Error('One or more environment variables are not defined')
		}

		// Load all content in parallel
		const [
			instructionsSanityChecker,
			instructionsSolRefiner,
			instructionsValidityReviewer,
			instructionsQualityReviewer,
			feedbackCleaner,
			cotShotsSanity,
			cotShotsQuality,
			cotShotsValidity,
		] = await Promise.all([
			loadContentFromURL(sanityCheckerUrl),
			loadContentFromURL(solutionRefinerUrl),
			loadContentFromURL(validityInstructionUrl),
			loadContentFromURL(qualityInstructionUrl),
			loadContentFromURL(feedbackCleanerUrl),
			loadContentFromURL(cotShotsSanityUrl),
			loadContentFromURL(cotShotsQualityUrl),
			loadContentFromURL(cotShotsValidityUrl),
		])

		// Check if any content failed to load
		if (
			!instructionsSanityChecker ||
			!instructionsSolRefiner ||
			!instructionsValidityReviewer ||
			!instructionsQualityReviewer ||
			!feedbackCleaner ||
			!cotShotsSanity ||
			!cotShotsQuality ||
			!cotShotsValidity
		) {
			throw new Error('Failed to load one or more instruction files')
		}

		// Initialize QuantaFTT after all content is loaded
		quantaFTT = new QuantaFTT(
			process.env.OPENAI_API_KEY,
			instructionsSanityChecker,
			instructionsSolRefiner,
			instructionsValidityReviewer,
			instructionsQualityReviewer,
			feedbackCleaner,
			cotShotsSanity,
			cotShotsQuality,
			cotShotsValidity,
			'gpt-4o', // For sanity feedback
			'gpt-4o', // For solution refinement
			'gpt-4o', // For validity feedback
			'gpt-4o', // For quality feedback,
			'gpt-4o' // For feedback cleaning
		)

		console.log('QuantaFTT initialized successfully')
	} catch (error) {
		console.error('Error during initialization:', error)
	}
}

initialize()

async function evaluateSolution(
	problem_statement,
	solution,
	student_solution,
	extra_requirements_validity
) {
	if (!problem_statement || !solution || !student_solution) {
		throw new Error('Missing required parameters for evaluateSolution')
	}

	try {
		const response = await quantaFTT.genFullFeedback(
			problem_statement,
			solution,
			student_solution,
			extra_requirements_validity,
			null
		)

		return response
	} catch (error) {
		console.error('Error in evaluateSolution:', error)
		throw new Error('Failed to evaluate solution')
	}
}

async function isUserValidated(id) {
	try {
		const response = await memberstack.members.retrieve({ id: id })

		if (!response.data) return false

		return response.data.verified
	} catch (error) {
		console.error('Error in connecting to MemberStack:', error)
		return false
	}
}

async function saveSubmission(values) {
	const query = `
        INSERT INTO submissions (
      memberstack_user_id, problem_id, user_input,
          overall_grade, all_response) 
      VALUES (?, ?, ?, ?, ?)
        `
	try {
		const [results] = await pool.execute(query, values)
		return results.insertId
	} catch (err) {
		console.error('Error inserting data:', err)
		return null
	}
}

app.post('/getUserSubmissions', async (req, res) => {
	try {
		const { user_id } = req.body

		if (!user_id) {
			return res.status(400).json({ message: 'user_id is required' })
		}

		let isUserValid = await isUserValidated(user_id)
		if (!isUserValid) {
			return res.status(401).json({ error: 'Invalid user ID' })
		}

		const submissionsQuery = `
            SELECT problem_id, id, overall_grade
            FROM submissions
            WHERE memberstack_user_id = ?
            ORDER BY time DESC;
        `

		const [submissions] = await pool.execute(submissionsQuery, [user_id])

		const problemsQuery = `
    SELECT id
    FROM problems;
`

		const [problems] = await pool.execute(problemsQuery)
		let result = {}
		problems.forEach((problem) => {
			result[problem.id] = []
		})

		submissions.forEach((submission) => {
			const { problem_id, id, overall_grade } = submission
			result[problem_id].push({
				id,
				overall_grade,
			})
		})

		res.status(200).json(result)
	} catch (error) {
		console.error(error)
		res.status(500).json({ message: 'Server error' })
	}
})

app.post('/getSubmission', async (req, res) => {
	try {
		const { submission_id, user_id } = req.body

		if (!submission_id) {
			return res.status(400).json({ message: 'submission_id is required' })
		}

		let isUserValid = await isUserValidated(user_id)
		if (!isUserValid) {
			return res.status(401).json({ error: 'Invalid user ID' })
		}

		const submissionDetailsQuery = `
            SELECT user_input, all_response
            FROM submissions
            WHERE id = ?;
        `

		const [submissionDetails] = await pool.execute(submissionDetailsQuery, [
			submission_id,
		])

		if (submissionDetails.length === 0) {
			return res.status(404).json({ message: 'Submission not found' })
		}

		res.status(200).json(submissionDetails[0])
	} catch (error) {
		console.error(error)
		res.status(500).json({ message: 'Server error' })
	}
})

app.post('/generateResponse', async (req, res) => {
	const { problem_id, student_solution, user_id } = req.body

	if (!problem_id || !student_solution) {
		return res.status(400).json({ error: 'Missing required parameters' })
	}

	let isUserValid = await isUserValidated(user_id)
	if (!isUserValid) {
		return res.status(401).json({ error: 'Invalid user ID' })
	}

	try {
		const query = `
      SELECT problem_statement, solution, extra_requirements_validity
      FROM problems 
      WHERE id = ?
    `

		const [rows] = await pool.execute(query, [problem_id])

		if (rows.length === 0) {
			return res.status(404).json({ error: 'Problem not found' })
		}

		const { problem_statement, solution, extra_requirements_validity } = rows[0]
		const response = await evaluateSolution(
			problem_statement,
			solution,
			student_solution,
			extra_requirements_validity
		)

		let subm_id = await saveSubmission([
			user_id,
			problem_id,
			student_solution,
			response['Overall Grade'] || '-',
			response,
		])

		res.json({ response: response, submission_id: subm_id })
	} catch (error) {
		console.error('Error in generateResponse:', error)
		res.status(500).json({ error: 'Internal server error' })
	}
})

app.post('/getProblems', async (req, res) => {
	const { ids } = req.body

	if (!Array.isArray(ids) || ids.length === 0) {
		return res
			.status(400)
			.json({ error: 'Invalid input. Please provide an array of IDs.' })
	}

	try {
		const placeholders = ids.map(() => '?').join(',')
		const query = `
      SELECT id, problem_statement
      FROM problems 
      WHERE id IN (${placeholders})
    `

		const [rows] = await pool.execute(query, ids)
		const problems = rows.reduce((acc, { id, problem_statement }) => {
			acc[id] = problem_statement
			return acc
		}, {})

		console.log(problems)

		res.json(problems)
	} catch (error) {
		console.error('Error fetching problems:', error)
		res.status(500).json({ error: 'Internal server error' })
	}
})

app.post('/submitFeedback', async (req, res) => {
	const { memberstack_user_id, submission_id, liked_by_user } = req.body

	if (
		typeof liked_by_user !== 'boolean' ||
		!memberstack_user_id ||
		!submission_id
	) {
		return res.status(400).json({ saved: false, message: 'Invalid input' })
	}

	try {
		const [submission] = await pool.execute(
			'SELECT memberstack_user_id FROM submissions WHERE id = ?',
			[submission_id]
		)

		if (submission.length === 0) {
			return res
				.status(404)
				.json({ saved: false, message: 'Submission not found' })
		}

		if (submission[0].memberstack_user_id !== memberstack_user_id) {
			return res
				.status(403)
				.json({ saved: false, message: 'User does not own this submission' })
		}

		const [result] = await pool.execute(
			'UPDATE submissions SET liked_by_user = ? WHERE id = ?',
			[liked_by_user, submission_id]
		)

		if (result.affectedRows === 1) {
			return res.json({ saved: true })
		} else {
			return res
				.status(500)
				.json({ saved: false, message: 'Failed to update submission' })
		}
	} catch (error) {
		console.error(error)
		return res
			.status(500)
			.json({ saved: false, message: 'Internal server error' })
	}
})

app.get('/status', async (req, res) => {
	res.json({ status: 'ok' })
})

const port = 3000

http.createServer(app).listen(port, () => {
	console.log('HTTP server running on port' + port)
})
