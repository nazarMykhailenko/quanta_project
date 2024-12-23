window.MathJax = {
	tex: {
		inlineMath: [
			['$', '$'],
			['\\(', '\\)'],
		],
		processEscapes: true,
	},
}

let serverLink = 'https://quanta-server.onrender.com/'
let popup = null
let popupDiv = null
let submissions = {}
let user_id = null

document.addEventListener('DOMContentLoaded', async () => {
	let response = await window.$memberstackDom.getCurrentMember()

	if (!response) {
		return
	}
	user_id = response.data.id

	window.addEventListener('click', function (event) {
		if (event.target === popup) {
			popup.style.display = 'none'
		}
	})

	fetch(serverLink + 'getUserSubmissions', {
		method: 'POST',
		body: JSON.stringify({
			user_id: user_id,
		}),
		headers: { 'Content-Type': 'application/json' },
	})
		.then((response) => {
			if (!response.ok) {
				console.error(`HTTPS error! status: ${response.status}`)
				return null
			}
			return response.json()
		})
		.then((data) => {
			let div = document.querySelector('#delta_user_results')
			div.innerHTML = `
                <table class="submissions-table">
                    <thead>
                        <tr>
                            <th>Problem ID</th>
                            <th>Grades</th>
                        </tr>
                    </thead>
                    <tbody id="t-body">
                    </tbody>
                </table>
            `
			let body = div.querySelector('#t-body')

			let body_html = ``
			// Filter data to include only IDs present in the global `ids` array
			for (let [id, results] of Object.entries(data)) {
				if (!ids.includes(id)) continue // Skip IDs not in the `ids` array
				let row_html = ``
				for (let result of results) {
					row_html += `<a onclick="showSubmission(event)" data-id="${result.id}">${result.overall_grade}</a>`
				}
				let problemName = id.replace(/_/g, ' ')
				body_html += `
                    <tr>
                        <td>${problemName}</td>
                        <td>
                            <div class="grades-list">
                                ${row_html}
                            </div>
                        </td>
                    </tr>
                `
			}
			body.innerHTML = body_html
		})
		.catch((error) => {
			console.error(error)
		})
})

function showSubmission(event) {
	event.preventDefault()
	if (popup) {
		popupDiv.innerHTML = `<p>Downloading your details, please wait</p>`
	} else {
		popup = document.createElement('div')
		popup.classList.add('popup')
		popup.innerHTML = `
			<div class="popup-content">
				<span class="close-btn" onclick="closePopup()">&times;</span>
				<div id="popup-body">
					<p>Downloading your details, please wait</p>
				</div>
			</div>
		`
		document.body.append(popup)
		popupDiv = popup.querySelector('#popup-body')
	}
	popup.style.display = 'flex'

	const id = event.target.getAttribute('data-id')
	if (submissions[id]) {
		renderDetails(submissions[id])
	} else {
		fetch(serverLink + 'getSubmission', {
			method: 'POST',
			body: JSON.stringify({
				user_id: user_id,
				submission_id: id,
			}),
			headers: { 'Content-Type': 'application/json' },
		})
			.then((response) => {
				if (!response.ok) {
					console.error(`HTTPS error! status: ${response.status}`)
					return null
				}
				return response.json()
			})
			.then((data) => {
				if (!data) return
				submissions[id] = data
				renderDetails(data)
			})
			.catch((error) => {
				console.error(error)
			})
	}
}

function closePopup(event) {
	popup.style.display = 'none'
}

function renderDetails(data) {
	if (!popup) {
		console.error('something went wrong');
		return;
	}

	// Ensure Overall Grade appears first
	let overallGrade = '';
	if (data.all_response && data.all_response.Overall_Grade) {
		overallGrade = `
		<div class="overall-grade-block">
		<div class="response-block overall-grade">
			<h3 class="response-title">Overall Grade:</h3>
			<p class="response-value">${data.all_response.Overall_Grade}</p>
		</div>
		</div>
		`;
		delete data.all_response.Overall_Grade; // Avoid duplication
	}

	// Generate remaining details
	let detailsHTML = Object.entries(data.all_response)
		.map(([key, value]) => {
			// Add the `long` class if value is longer than 30 characters
			const blockClass = value.length > 30 ? 'response-block long' : 'response-block';
			return `
			<div class="${blockClass}">
				<h3 class="response-title">${key.replace(/_/g, ' ')}:</h3>
				<p class="response-value">${value}</p>
			</div>
		`;
		})
		.join('');

	// Combine overall grade, input, and other details
	let html = `
		${overallGrade}
		${detailsHTML}
		<div class="response-block input-response">
			<h3 class="response-title">Your input:</h3>
			<p class="response-value">${data.user_input}</p>
		</div>
	`;

	popupDiv.innerHTML = html;

	try {
		MathJax.typeset([popupDiv]);
	} catch (e) {
		console.error(e);
	}
}