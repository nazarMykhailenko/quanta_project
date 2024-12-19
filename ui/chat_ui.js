// const serverLink = 'https://quantaapi.vercel.app/'
const serverLink = 'http://localhost:3000/'
let chat = null
let user_id = null
let is_user_verified = null

//run this code once, copy problem ids from console, insert them to code, and comment following lines of code afterwards
// function getIDS() {
// 	document.addEventListener('DOMContentLoaded', () => {
// 		let containers = document.getElementsByClassName('insert-problem')
// 		if (containers.length == 0) {
// 			return
// 		}
// 		let ids = []
// 		for (let i = 0; i < containers.length; i++) {
// 			let container = containers[i]
// 			let id = container.getAttribute('data-id')
// 			if (!id) {
// 				containers[i].innerHTML = 'No problem id reference :('
// 				continue
// 			}
// 			ids.push(id)
// 		}
// 		console.log(ids)
// 	})
// }
// getIDS()

async function fetchProblems(serverLink, ids) {
	try {
		const response = await fetch(serverLink + 'getProblems', {
			method: 'POST',
			body: JSON.stringify({ ids: ids }),
			headers: { 'Content-Type': 'application/json' },
		})

		if (!response.ok) {
			console.error(`HTTPS error! status: ${response.status}`)
			return null
		}

		const data = await response.json()
		return data
	} catch (error) {
		console.error('Error fetching data:', error)
		return null
	}
}

document.addEventListener('DOMContentLoaded', async () => {
	window.$memberstackDom.getCurrentMember().then((response) => {
		if (response) {
			user_id = response.data.id
			is_user_verified = response.data.verified
			console.log('here', user_id, is_user_verified)
		}
	})

	let data = null

	// Fetch problems and ensure data is available before processing
	try {
		data = await fetchProblems(serverLink, ids)
		console.log('Fetched Problems:', data)

		// Process the elements only after data is fetched
		document.querySelectorAll('.insert-problem').forEach((el) => {
			let id = el.innerText.replace(/\s+/g, '')

			if (!data[id]) {
				// Check if data for the id exists
				el.innerHTML = `Failed to load element with id ${id}`
				return
			}

			let problemName = id.replace(/_/g, ' ')
			let img_src = `https://cdn.prod.website-files.com/6568bfe66e016172daa08150/66ede06843f101bc518e0798_submit_icon.svg`
			el.innerHTML = `
							<p class="edu-problem-name-and-num">${problemName}</p>
							<p class="edu-p">${data[id]}</p>
							<div class="sbmt-button-container"><img src="${img_src}" class="sbmt-button" data-id="${id}" onclick="openChat(event)"></div>
					`

			try {
				MathJax.startup.promise
					.then(() => {
						MathJax.typeset([el])
					})
					.catch((err) => console.log('MathJax initialization failed:', err))
			} catch (e) {
				console.error('MathJax initialization failed:', e)
			}
		})
	} catch (error) {
		console.error('Error fetching problems:', error)
	}
})

function openChat(ev) {
	let id = ev.target.getAttribute('data-id')
	let problemName = id.replace(/_/g, ' ')
	if (!chat) {
		chatWindow = document.createElement('div')
		chatWindow.id = 'chatWindow'
		chatWindow.innerHTML = `
        <span class="close-chat-btn" onclick="closeWindow(event)">&times;</span>

    <div id="inputDiv" class="chat-screen">
        <h6 id="submitHeader">Submit your solution to ${problemName}:</h6>
        <textarea id="solution-input" onkeydown="handleKeydown(event)" placeholder="Type your solution, feel free to use LaTeX"></textarea>
        <button id="submit-btn" class="btn" onclick="sendSolution(event)">Send</button>
    </div>

    <!-- Loading Screen -->
    <div id="loadingDiv" class="chat-screen">
        <p>Grading your submission, stay tuned :)</p>
    </div>

    <!-- Result Screen -->
    <div id="responseDIV" class="chat-screen">
        <div id="responseBody">
        </div>
        <div id="feedback-buttons">
            <button id="thumb-up-btn" onclick="sendFeedback(event, true)" class="btn">👍</button>
            <button id="thumb-down-btn" onclick="sendFeedback(event, false)" class="btn">👎</button>
            <p id="thnk_feedback" style="display: none">Thank you for your feedback</p>
        </div>
    </div>

    <!-- Error Screen -->
    <div id="errorDiv" class="chat-screen">
        <p id="error-message"></p>
    </div>
    `
		document.body.appendChild(chatWindow)
		chat = {
			window: chatWindow,
			input: chatWindow.querySelector('#solution-input'),
			loadingDiv: chatWindow.querySelector('#loadingDiv'),
			responseDIV: chatWindow.querySelector('#responseDIV'),
			responseBody: chatWindow.querySelector('#responseBody'),
			inputDiv: chatWindow.querySelector('#inputDiv'),
			submitHeader: chatWindow.querySelector('#submitHeader'),
			errorDiv: chatWindow.querySelector('#errorDiv'),
			errorP: chatWindow.querySelector('#error-message'),
			thnkFeedback: chatWindow.querySelector('#thnk_feedback'),
			problemID: id,
			status: 'input',
		}
		showChatPage('inputDiv')
	} else {
		if (!is_user_verified) {
			showError(
				'Only registered, and verified users can send solutions. Login and verify your email to continue'
			)
			return
		}
		if (chat.status == 'fetching') chat.controller.abort()
		chat.submitHeader.innerHTML = `Submit your solution to ${problemName}:`
		showChatPage('inputDiv')
		chat.problemID = id
		chat.status = 'input'
	}
}

function closeWindow(ev) {
	if (chat.status == 'fetching') chat.controller.abort()
	chat.problemID = null
	chat.window.style.display = 'none'
	chat.status = 'closed'
}

function showChatPage(pageID) {
	if (!chat) {
		console.error('No chat found')
		return
	}

	chat.window.style.display = 'block'
	chat.window.querySelectorAll('.chat-screen').forEach((screen) => {
		screen.style.display = 'none'
	})

	// Adjust chat window width based on the active page
	if (pageID === 'inputDiv') {
		chat.window.classList.add('inputDiv-active') // Add class for inputDiv
	} else {
		chat.window.classList.remove('inputDiv-active') // Remove class for other divs
	}

	if (pageID === 'inputDiv') {
		chat.thnkFeedback.style.display = 'none'
		for (let id of ['thumb-up-btn', 'thumb-down-btn']) {
			let el = document.getElementById(id)
			el.classList.remove('pressed')
			el.removeAttribute('disabled')
		}
	}
	chat.window.querySelector(`#${pageID}`).style.display = 'block'
}

function showError(msg) {
	showChatPage('errorDiv')
	chat.errorP.innerHTML = msg
}

function sendSolution(ev) {
	const solution = chat.input.value.trim()
	if (!solution) return
	if (!chat.problemID) {
		console.error('Something went wrong')
		return
	}
	chat.input.value = ''
	showChatPage('loadingDiv')
	chat.status = 'fetching'
	chat.controller = new AbortController()
	fetch(serverLink + 'generateResponse', {
		method: 'POST',
		body: JSON.stringify({
			problem_id: chat.problemID,
			student_solution: solution,
			user_id: user_id,
		}),
		headers: { 'Content-Type': 'application/json' },
		signal: chat.controller.signal,
	})
		.then((response) => {
			console.log(response)
			chat.status = 'checked'
			if (!response.ok) {
				console.error(`HTTP error! status: ${response.status}`)
				chat.status = 'error'
				if (response.status == 401) {
					showError(
						'Only registered, and verfied users can send solutions. Login and verify your email to continue'
					)
				} else {
					showError('Ooops sometging went wrong:(')
				}
			}
			return response.json()
		})
		.then((data) => {
			if (!data.response) return
			let html = ``

			// Extract Overall_Grade first
			const overallGradeKey = 'Overall_Grade'
			const overallGradeValue = data.response[overallGradeKey]

			if (overallGradeValue !== undefined) {
				const formattedKey = overallGradeKey
					.replace(/_/g, ' ') // Replace underscores with spaces
					.replace(/\b\w/g, (char) => char.toUpperCase()) // Capitalize each word

				html += `
							<div class="response-block overall-grade">
									<h3 class="response-title">${formattedKey}:</h3>
									<p class="response-value">${overallGradeValue}</p>
							</div>
					`
				delete data.response[overallGradeKey] // Remove it to avoid duplication
			}

			// Process remaining keys
			for (let [key, value] of Object.entries(data.response)) {
				console.log(key, value)

				// Format key: replace underscores with spaces and capitalize each word
				const formattedKey = key
					.replace(/_/g, ' ')
					.replace(/\b\w/g, (char) => char.toUpperCase())

				// Check if value length exceeds 30 characters
				const blockClass =
					value.length > 30 ? 'response-block long' : 'response-block'

				html += `
							<div class="${blockClass}">
									<h3 class="response-title">${formattedKey}:</h3>
									<p class="response-field">${value}</p>
							</div>
					`
			}

			chat.responseBody.innerHTML = html
			showChatPage('responseDIV')
			chat.responseID = data.submission_id

			try {
				MathJax.typeset([chat.responseDIV])
			} catch (e) {
				console.error(e)
			}
		})
		.catch((error) => {
			if (chat.controller.signal.aborted) return
			chat.status = 'error'
			showError('Ooops sometging went wrong:(')
			console.error('Error fetching data:', error)
		})
}

function sendFeedback(ev, liked) {
	ev.target.classList.add('pressed')
	document.getElementById('thumb-up-btn').setAttribute('disabled', true)
	document.getElementById('thumb-down-btn').setAttribute('disabled', true)
	chat.thnkFeedback.style.display = 'block'
	fetch(serverLink + 'submitFeedback', {
		method: 'POST',
		body: JSON.stringify({
			memberstack_user_id: user_id,
			submission_id: chat.responseID,
			liked_by_user: liked,
		}),
		headers: { 'Content-Type': 'application/json' },
	})
		.then((response) => {
			if (!response.ok) {
				console.error(`HTTP error! status: ${response.status}`)
				return response.json()
			}
			return response.json()
		})
		.then((data) => {
			console.log(`Saved: ${data.saved}`)
		})
		.catch((error) => {
			console.error('Error fetching data:', error)
		})
}

function handleKeydown(event) {
	if (event.key === 'Enter' && !event.shiftKey) {
		sendSolution()
	}
}
