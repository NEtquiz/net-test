// Global variables
let currentQuiz = null;
let currentQuestionIndex = 0;
let userProfile = {
    name: '',
    username: '',
    bio: '',
    interests: ['teori test'],
    stats: {
        quizzes: 0,
        accuracy: '0%',
        rank: 0
    }
};
let userCreatedQuizzes = [];
let questionCount = 1;
let questionImages = {}; // To store image data for questions
let registeredUsers = []; // To store registered users

// Variables to track user's answers and score
let userAnswers = [];
let currentScore = 0;

// Timer variables
let quizTimerInterval;
let quizTimeRemaining;

// Check if the browser supports background sync
function registerBackgroundSync() {
    if ('serviceWorker' in navigator && 'SyncManager' in window) {
        navigator.serviceWorker.ready
            .then(registration => {
                // Register background sync
                return registration.sync.register('sync-quizzes');
            })
            .then(() => {
                console.log('Background sync registered!');
            })
            .catch(err => {
                console.error('Background sync registration failed:', err);
            });
    } else {
        console.log('Background sync not supported');
    }
}

// Register for periodic sync (checks for updates regularly)
function registerPeriodicSync() {
    if ('serviceWorker' in navigator && 'periodicSync' in navigator.serviceWorker) {
        navigator.serviceWorker.ready
            .then(registration => {
                // Check if periodic sync is available
                return registration.periodicSync.getTags()
                    .then(tags => {
                        if (!tags.includes('update-content')) {
                            // Register for content updates every 24 hours (minimum time is set by browser)
                            return registration.periodicSync.register('update-content', {
                                minInterval: 24 * 60 * 60 * 1000 // 24 hours
                            });
                        }
                    });
            })
            .then(() => {
                console.log('Periodic sync registered!');
            })
            .catch(err => {
                console.error('Periodic sync registration failed:', err);
            });
    } else {
        console.log('Periodic sync not supported');
    }
}

// Request notification permission
function requestNotificationPermission() {
    if ('Notification' in window) {
        Notification.requestPermission()
            .then(permission => {
                if (permission === 'granted') {
                    console.log('Notification permission granted');
                    subscribeToPushNotifications();
                } else {
                    console.log('Notification permission denied');
                }
            });
    } else {
        console.log('Notifications not supported');
    }
}

// Subscribe to push notifications
function subscribeToPushNotifications() {
    if ('serviceWorker' in navigator && 'PushManager' in window) {
        let swRegistration;
        navigator.serviceWorker.ready
            .then(registration => {
                swRegistration = registration;
                return registration.pushManager.getSubscription();
            })
            .then(subscription => {
                if (!subscription) {
                    // Create a new subscription
                    const applicationServerKey = urlBase64ToUint8Array(
                        // Replace with your VAPID public key
                        'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U'
                    );
                    
                    return swRegistration.pushManager.subscribe({
                        userVisibleOnly: true,
                        applicationServerKey: applicationServerKey
                    });
                }
            })
            .then(subscription => {
                if (subscription) {
                    // Send the subscription to your server
                    console.log('User subscribed to push notifications');
                    console.log(JSON.stringify(subscription));
                    // In a real app, you would send this subscription to your server
                    // sendSubscriptionToServer(subscription);
                }
            })
            .catch(err => {
                console.error('Failed to subscribe to push notifications:', err);
            });
    }
}

// Helper function to convert base64 to Uint8Array for VAPID key
function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding)
        .replace(/-/g, '+')
        .replace(/_/g, '/');
    
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    
    for (let i = 0; i < rawData.length; ++i) {
        outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
}

// Enhanced localStorage saving with offline support
function saveToLocalStorageWithSync(key, data) {
    // Save to localStorage
    localStorage.setItem(key, JSON.stringify(data));
    
    // If offline, queue for sync
    if (!navigator.onLine && 'serviceWorker' in navigator && 'SyncManager' in window) {
        // Add to sync queue
        const dbPromise = indexedDB.open('net-quiz-sync', 1);
        
        dbPromise.onsuccess = event => {
            const db = event.target.result;
            const tx = db.transaction('requests', 'readwrite');
            const store = tx.objectStore('requests');
            
            store.add({
                url: '/api/saveData', // This would be your server endpoint
                method: 'POST',
                body: {
                    key: key,
                    data: data
                },
                timestamp: Date.now()
            });
            
            tx.oncomplete = () => {
                // Register for background sync
                navigator.serviceWorker.ready
                    .then(registration => {
                        return registration.sync.register('sync-quizzes');
                    });
            };
        };
    }
}

// Function to handle online/offline events
function setupOnlineOfflineHandlers() {
    window.addEventListener('online', () => {
        console.log('App is online');
        document.body.classList.remove('offline');
        
        // Trigger sync when we come back online
        if ('serviceWorker' in navigator && 'SyncManager' in window) {
            navigator.serviceWorker.ready
                .then(registration => {
                    return registration.sync.register('sync-quizzes');
                });
        }
        
        // Show toast notification to user
        showToast('You are back online!');
    });
    
    window.addEventListener('offline', () => {
        console.log('App is offline');
        document.body.classList.add('offline');
        
        // Show toast notification to user
        showToast('You are offline. Changes will be saved when you reconnect.');
    });
}

// Simple toast notification function
function showToast(message) {
    // Create toast element if it doesn't exist
    let toast = document.getElementById('toast-notification');
    
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'toast-notification';
        document.body.appendChild(toast);
    }
    
    // Set message and show
    toast.textContent = message;
    toast.classList.add('show');
    
    // Auto-hide after 3 seconds
    setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}

// Initialize all offline functionality
function initializeOfflineSupport() {
    // Set initial online/offline status
    if (!navigator.onLine) {
        document.body.classList.add('offline');
    }
    
    // Setup handlers
    setupOnlineOfflineHandlers();
    
    // Register for capabilities
    registerBackgroundSync();
    registerPeriodicSync();
    requestNotificationPermission();
}

// Function to handle navigation between screens
function showScreen(screenId) {
    // Hide all screens
    const screens = document.querySelectorAll('.screen');
    screens.forEach(screen => {
        screen.style.display = 'none';
    });
    
    // Show the requested screen
    const screenToShow = document.getElementById(screenId);
    if (screenToShow) {
        screenToShow.style.display = 'block';
    }
}

// Function to toggle between login and signup forms
function toggleAuthForms(formType) {
    const loginForm = document.getElementById('login-form');
    const signupForm = document.getElementById('signup-form');
    
    if (formType === 'login') {
        loginForm.style.display = 'block';
        signupForm.style.display = 'none';
    } else if (formType === 'signup') {
        loginForm.style.display = 'none';
        signupForm.style.display = 'block';
    }
}

// Function to copy invite code to clipboard
function copyInviteCode() {
    const code = document.querySelector('.code').textContent;
    navigator.clipboard.writeText(code)
        .then(() => {
            // Update button text temporarily to show success
            const copyButton = document.querySelector('.copy-button');
            const originalText = copyButton.innerHTML;
            copyButton.innerHTML = '<span>Copied!</span>';
            
            // Reset button text after 2 seconds
            setTimeout(() => {
                copyButton.innerHTML = originalText;
            }, 2000);
        })
        .catch(err => {
            console.error('Failed to copy: ', err);
        });
}

// Sample quiz data - empty by default
const quizzes = [];

// Function to load quizzes by category
function loadQuizByCategory(category) {
    // Check if it's a sample category or user quiz
    if (category === 'teori test') {
        // Redirect to My Quizzes or create quiz page if no quizzes
        const userQuizzes = JSON.parse(localStorage.getItem('userCreatedQuizzes')) || [];
        if (userQuizzes.length > 0) {
            showMyQuizzesScreen();
        } else {
            showScreen('quiz-creation-screen');
            alert('Please create your own quiz first');
        }
        return;
    }
    
    const quiz = quizzes.find(q => q.category === category);
    if (quiz) {
        currentQuiz = quiz;
        currentQuestionIndex = 0;
        loadQuestion();
    }
}

// Function to load question with image size preferences
function loadQuestion() {
    console.log("Loading question:", currentQuestionIndex);
    
    // Check if we have more questions
    if (currentQuestionIndex >= currentQuiz.questions.length) {
        showQuizResults();
        return;
    }
    
    // Get current question
    const currentQuestion = currentQuiz.questions[currentQuestionIndex];
    console.log("Question text:", currentQuestion.text);
    
    // Get quiz content container
    const quizContent = document.querySelector('.quiz-content');
    if (!quizContent) {
        console.error("Quiz content container not found");
        return;
    }
    
    // Clear previous content
    quizContent.innerHTML = '';
    
    // Add question counter
    const questionCounter = document.createElement('div');
    questionCounter.className = 'question-counter';
    questionCounter.textContent = `Question ${currentQuestionIndex + 1} of ${currentQuiz.questions.length}`;
    quizContent.appendChild(questionCounter);
    
    // Check if this is an STI/NAT category
    const isSTINAT = currentQuiz.category && 
        (currentQuiz.category.toLowerCase().includes("nat") || 
         currentQuiz.category.toLowerCase().includes("sti"));
    
    // Add question image if available
    if (currentQuestion.image) {
        console.log("Question has image, displaying it");
        
        // Create image container
        const imageContainer = document.createElement('div');
        
        // Apply specialized CSS classes for STI/NAT images if applicable
        if (isSTINAT) {
            imageContainer.className = 'question-image-container sti-nat-container';
            console.log("Applying STI/NAT optimized container");
        } else {
            imageContainer.className = 'question-image-container';
            imageContainer.style.padding = '5px';
            imageContainer.style.marginBottom = '25px';
        }
        
        imageContainer.style.width = '100%';
        
        // Create the image element
        const image = document.createElement('img');
        image.src = currentQuestion.image;
        
        // Apply specialized styles for STI/NAT
        if (isSTINAT) {
            image.className = 'question-image sti-nat-image';
            console.log("Applying STI/NAT optimized image styles");
        } else {
            image.className = 'question-image';
        }
        
        image.alt = 'Question Image';
        
        // Apply saved size preferences if available
        if (currentQuestion.imageWidth && currentQuestion.imageHeight) {
            console.log(`Applying saved image size: ${currentQuestion.imageWidth} x ${currentQuestion.imageHeight}`);
            image.style.width = currentQuestion.imageWidth;
            image.style.height = currentQuestion.imageHeight;
        }
        
        // Add image to container first
        imageContainer.appendChild(image);
        
        // Add resizing functionality to the image
        const resizableContainer = makeImageResizable(image, imageContainer);
        
        // Add the container to quiz content
        quizContent.appendChild(imageContainer);
    } else {
        console.log("Question has no image");
    }
    
    // Create question element (AFTER image for better flow)
    const questionElement = document.createElement('p');
    questionElement.className = 'quiz-question';
    questionElement.textContent = currentQuestion.text;
    
    // Make question text smaller if this is STI/NAT to emphasize image
    if (isSTINAT && currentQuestion.image) {
        questionElement.style.fontSize = '16px';
        questionElement.style.margin = '15px 0';
    }
    
    quizContent.appendChild(questionElement);
    
    // Create options container
    const optionsContainer = document.createElement('div');
    optionsContainer.className = 'quiz-options';
    
    // Add options
    currentQuestion.options.forEach((option, index) => {
        // Create option element
        const optionElement = document.createElement('div');
        optionElement.className = 'quiz-option';
        
        // Create option text
        const optionText = document.createElement('span');
        optionText.textContent = option.text; // Use option.text instead of the entire option object
        
        // Create toggle
        const toggle = document.createElement('label');
        toggle.className = 'toggle';
        
        const input = document.createElement('input');
        input.type = 'checkbox';
        input.dataset.index = index;
        input.addEventListener('change', function() {
            handleOptionSelection(this);
        });
        
        const slider = document.createElement('span');
        slider.className = 'slider';
        
        // Assemble the option
        toggle.appendChild(input);
        toggle.appendChild(slider);
        optionElement.appendChild(optionText);
        optionElement.appendChild(toggle);
        optionsContainer.appendChild(optionElement);
    });
    
    quizContent.appendChild(optionsContainer);
    
    // Add next/finish button
    const actionButton = document.createElement('button');
    actionButton.className = 'primary-button action-button';
    actionButton.textContent = currentQuestionIndex === currentQuiz.questions.length - 1 ? 'Finish' : 'Next';
    actionButton.addEventListener('click', handleNextQuestion);
    quizContent.appendChild(actionButton);
}

// Function to handle option selection
function handleOptionSelection(checkbox) {
    // Get all options for this question
    const optionCheckboxes = document.querySelectorAll('.quiz-option input[type="checkbox"]');
    
    // Store user answer
    if (!userAnswers[currentQuestionIndex]) {
        userAnswers[currentQuestionIndex] = [];
    }
    
    // Clear previous answer and set new one
    userAnswers[currentQuestionIndex] = [];
    
    // Get all selected options
    optionCheckboxes.forEach((box, idx) => {
        if (box.checked) {
            userAnswers[currentQuestionIndex].push(idx);
        }
    });
    
    console.log("User selected options:", userAnswers[currentQuestionIndex]);
}

// Function to handle next button click
function handleNextQuestion() {
    // Save current answer if user hasn't selected anything
    if (!userAnswers[currentQuestionIndex]) {
        userAnswers[currentQuestionIndex] = [];
    }
    
    // Check if current answer is correct
    const currentQuestion = currentQuiz.questions[currentQuestionIndex];
    const correctAnswers = currentQuestion.options
        .map((option, index) => option.correct ? index : -1)
        .filter(index => index !== -1);
    
    // Compare user answers with correct answers
    const userSelectedAnswers = userAnswers[currentQuestionIndex];
    let isCorrect = true;
    
    // Check that user selected all correct answers and no incorrect ones
    if (userSelectedAnswers.length !== correctAnswers.length) {
        isCorrect = false;
    } else {
        for (const answer of userSelectedAnswers) {
            if (!correctAnswers.includes(answer)) {
                isCorrect = false;
                break;
            }
        }
    }
    
    // Update score if correct
    if (isCorrect) {
        currentScore++;
    }
    
    // Move to next question
    currentQuestionIndex++;
    
    // Load next question or show results if done
    loadQuestion();
}

// Function to submit answers and show results
function submitAnswers() {
    // Pause the timer when submitting answers
    pauseQuizTimer();
    
    // Calculate score
    currentScore = 0;
    
    for (let i = 0; i < userAnswers.length; i++) {
        if (userAnswers[i] === currentQuiz.questions[i].correct) {
            currentScore++;
        }
    }
    
    // Update score display on results screen
    document.querySelector('.score-value').textContent = currentScore;
    document.querySelector('.total-questions').textContent = currentQuiz.questions.length;
    
    // Update user statistics
    updateUserStatistics(currentScore, currentQuiz.questions.length);
    
    // Show results screen
    showQuizResults();
}

// Function to show the quiz results
function showQuizResults() {
    // Stop the timer when showing results
    pauseQuizTimer();
    
    // Show results screen
    showScreen('results-screen');
    
    // Update results content
    const resultsContent = document.querySelector('.results-content');
    if (resultsContent) {
        // Update trophy message
        const trophyMessage = resultsContent.querySelector('h2');
        if (trophyMessage) {
            const percentage = Math.round((currentScore / currentQuiz.questions.length) * 100);
            
            if (percentage >= 80) {
                trophyMessage.textContent = 'Excellent!';
            } else if (percentage >= 60) {
                trophyMessage.textContent = 'Good job!';
            } else if (percentage >= 40) {
                trophyMessage.textContent = 'Nice try!';
            } else {
                trophyMessage.textContent = 'Keep practicing!';
            }
        }
        
        // Update single player score display
        const scoreValue = resultsContent.querySelector('.score-value');
        const totalQuestions = resultsContent.querySelector('.total-questions');
        
        if (scoreValue) {
            scoreValue.textContent = currentScore;
        }
        
        if (totalQuestions) {
            totalQuestions.textContent = currentQuiz.questions.length;
        }
    }
    
    // Reset for next quiz
    userAnswers = [];
}

// Function to save user profile
function saveProfile() {
    // Get values from form
    userProfile.name = document.getElementById('profile-name').value;
    userProfile.username = document.getElementById('profile-username').value;
    userProfile.bio = document.getElementById('profile-bio').value;
    
    // Save to local storage
    localStorage.setItem('userProfile', JSON.stringify(userProfile));
    
    // Show success message
    alert('Profile saved successfully!');
    
    // Go back to categories
    showScreen('categories-screen');
}

// Function to toggle interest tag selection
function toggleInterestTag(event) {
    const tag = event.target;
    const interest = tag.textContent;
    
    // Toggle selected class
    tag.classList.toggle('selected');
    
    // Update userProfile interests
    if (tag.classList.contains('selected')) {
        if (!userProfile.interests.includes(interest)) {
            userProfile.interests.push(interest);
        }
    } else {
        userProfile.interests = userProfile.interests.filter(i => i !== interest);
    }
}

// Function to load user profile data
function loadUserProfile() {
    const savedProfile = localStorage.getItem('userProfile');
    if (savedProfile) {
        userProfile = JSON.parse(savedProfile);
        
        // Update form fields
        document.getElementById('profile-name').value = userProfile.name;
        document.getElementById('profile-username').value = userProfile.username;
        document.getElementById('profile-bio').value = userProfile.bio;
        
        // Update interest tags
        const interestTags = document.querySelectorAll('.interest-tag');
        interestTags.forEach(tag => {
            const interest = tag.textContent;
            if (userProfile.interests.includes(interest)) {
                tag.classList.add('selected');
            } else {
                tag.classList.remove('selected');
            }
        });
        
        // Update connected accounts
        updateConnectedAccounts();
    }
}

// Function to update connected accounts display
function updateConnectedAccounts() {
    const currentUserEmail = localStorage.getItem('user_email');
    if (!currentUserEmail) return;
    
    const users = JSON.parse(localStorage.getItem('registeredUsers')) || [];
    const user = users.find(user => user.email === currentUserEmail);
    
    if (!user) return;
    
    // Update Google connection
    const googleConnectBtn = document.getElementById('google-connect-btn');
    const googleDisconnectBtn = document.getElementById('google-disconnect-btn');
    
    if (user.socialConnections && user.socialConnections.google) {
        // User has connected Google account
        googleConnectBtn.style.display = 'none';
        googleDisconnectBtn.style.display = 'block';
        
        // Add connected email if not already there
        const connectionInfo = document.querySelector('#google-connection .connection-info');
        if (!connectionInfo.querySelector('.connection-email')) {
            const emailElement = document.createElement('div');
            emailElement.className = 'connection-email';
            emailElement.textContent = user.socialConnections.google.email;
            connectionInfo.appendChild(emailElement);
            
            // Add connected status
            const statusElement = document.createElement('div');
            statusElement.className = 'connected-status';
            statusElement.innerHTML = '<div class="status-dot"></div> Connected';
            connectionInfo.appendChild(statusElement);
        }
    } else {
        // User has not connected Google account
        googleConnectBtn.style.display = 'block';
        googleDisconnectBtn.style.display = 'none';
        
        // Remove email and status if they exist
        const connectionInfo = document.querySelector('#google-connection .connection-info');
        const emailElement = connectionInfo.querySelector('.connection-email');
        const statusElement = connectionInfo.querySelector('.connected-status');
        
        if (emailElement) emailElement.remove();
        if (statusElement) statusElement.remove();
    }
    
    // Update Facebook connection
    const facebookConnectBtn = document.getElementById('facebook-connect-btn');
    const facebookDisconnectBtn = document.getElementById('facebook-disconnect-btn');
    
    if (user.socialConnections && user.socialConnections.facebook) {
        // User has connected Facebook account
        facebookConnectBtn.style.display = 'none';
        facebookDisconnectBtn.style.display = 'block';
        
        // Add connected email if not already there
        const connectionInfo = document.querySelector('#facebook-connection .connection-info');
        if (!connectionInfo.querySelector('.connection-email')) {
            const emailElement = document.createElement('div');
            emailElement.className = 'connection-email';
            emailElement.textContent = user.socialConnections.facebook.email;
            connectionInfo.appendChild(emailElement);
            
            // Add connected status
            const statusElement = document.createElement('div');
            statusElement.className = 'connected-status';
            statusElement.innerHTML = '<div class="status-dot"></div> Connected';
            connectionInfo.appendChild(statusElement);
        }
    } else {
        // User has not connected Facebook account
        facebookConnectBtn.style.display = 'block';
        facebookDisconnectBtn.style.display = 'none';
        
        // Remove email and status if they exist
        const connectionInfo = document.querySelector('#facebook-connection .connection-info');
        const emailElement = connectionInfo.querySelector('.connection-email');
        const statusElement = connectionInfo.querySelector('.connected-status');
        
        if (emailElement) emailElement.remove();
        if (statusElement) statusElement.remove();
    }
}

// Function to add a new question to the quiz creator
function addQuestion() {
    // Check if we've reached the maximum of 45 questions
    const questionList = document.getElementById('question-list');
    const questions = questionList.querySelectorAll('.question-item');
    
    if (questions.length >= 45) {
        alert('Maximum limit of 45 questions reached!');
        return;
    }
    
    questionCount++;
    const questionItem = document.createElement('div');
    questionItem.className = 'question-item';
    questionItem.innerHTML = `
        <div class="question-header">
            <span class="question-number">Question ${questionCount}</span>
            <button class="question-delete" onclick="removeQuestion(${questionCount - 1})">×</button>
        </div>
        <div class="form-group">
            <input type="text" class="question-text" placeholder="Enter your question">
        </div>
        <div class="question-image-container">
            <div class="image-preview-area">
                <img class="question-image-preview" style="display: none;">
            </div>
            <div class="image-upload-controls">
                <label for="q${questionCount}-image" class="image-upload-label">
                    <span class="image-icon">🖼️</span> Add Image
                </label>
                <input type="file" id="q${questionCount}-image" class="question-image-input" accept="image/*" onchange="previewQuestionImage(this, ${questionCount - 1})" style="display: none;">
                <button type="button" class="remove-image-btn" onclick="removeQuestionImage(${questionCount - 1})" style="display: none;">Remove Image</button>
            </div>
        </div>
        <div class="answer-options">
            <div class="answer-option">
                <input type="checkbox" id="q${questionCount}-correct-1">
                <input type="text" placeholder="Option 1">
            </div>
            <div class="answer-option">
                <input type="checkbox" id="q${questionCount}-correct-2">
                <input type="text" placeholder="Option 2">
            </div>
            <div class="answer-option">
                <input type="checkbox" id="q${questionCount}-correct-3">
                <input type="text" placeholder="Option 3">
            </div>
            <div class="answer-option">
                <input type="checkbox" id="q${questionCount}-correct-4">
                <input type="text" placeholder="Option 4">
            </div>
        </div>
    `;
    
    questionList.appendChild(questionItem);
    
    // Update question counter display
    updateQuestionCounter();
}

// Function to remove a question from the quiz creator
function removeQuestion(index) {
    const questionList = document.getElementById('question-list');
    const questions = questionList.querySelectorAll('.question-item');
    
    if (questions.length <= 1) {
        alert('Quiz must have at least one question!');
        return;
    }
    
    questions[index].remove();
    questionCount--;
    
    // Update question numbers
    const remainingQuestions = questionList.querySelectorAll('.question-item');
    remainingQuestions.forEach((q, i) => {
        q.querySelector('.question-number').textContent = `Question ${i + 1}`;
        
        // Update delete button onclick
        q.querySelector('.question-delete').setAttribute('onclick', `removeQuestion(${i})`);
        
        // Update checkbox IDs
        const checkboxes = q.querySelectorAll('input[type="checkbox"]');
        checkboxes.forEach((cb, j) => {
            cb.id = `q${i + 1}-correct-${j + 1}`;
        });
    });
    
    // Update question counter display
    updateQuestionCounter();
}

// Function to handle quiz creation form submission
function createQuiz(event) {
    if (event) {
        event.preventDefault();
    }
    
    // Get quiz title
    const quizTitle = document.getElementById('quiz-title').value;
    if (!quizTitle) {
        alert("Please enter a quiz title");
        return;
    }
    
    // Gather all question elements
    const questionElements = document.querySelectorAll('.question-item');
    if (questionElements.length === 0) {
        alert("Please add at least one question");
        return;
    }
    
    // Create questions array
    const questions = [];
    
    // Process each question
    questionElements.forEach((questionElement, index) => {
        // Get question text
        const questionText = questionElement.querySelector('.question-text').value;
        if (!questionText) {
            alert(`Question ${index + 1} is missing text`);
            return;
        }
        
        // Get answer options
        const answerOptions = [];
        const optionElements = questionElement.querySelectorAll('.answer-option');
        
        optionElements.forEach((optionElement, optionIndex) => {
            const optionText = optionElement.querySelector('input[type="text"]').value;
            const isCorrect = optionElement.querySelector('input[type="checkbox"]').checked;
            
            if (optionText) {
                answerOptions.push({
                    text: optionText,
                    correct: isCorrect
                });
            }
        });
        
        // Validate we have at least one correct answer
        const hasCorrectAnswer = answerOptions.some(option => option.correct);
        if (!hasCorrectAnswer) {
            alert(`Question ${index + 1} doesn't have a correct answer marked`);
            return;
        }
        
        // Create question object
        const questionObj = {
            text: questionText,
            options: answerOptions
        };
        
        // Add question image if available
        const imagePreview = questionElement.querySelector('.question-image-preview');
        if (imagePreview && imagePreview.src && 
            imagePreview.style.display !== 'none' && 
            !imagePreview.src.endsWith('placeholder.png')) {
            console.log(`Adding image for question ${index + 1}`);
            
            // Store the image size preferences if available
            const resizableContainer = imagePreview.closest('.resizable-image-container');
            if (resizableContainer) {
                const width = imagePreview.style.width;
                const height = imagePreview.style.height;
                
                questionObj.image = imagePreview.src;
                questionObj.imageWidth = width || '100%';
                questionObj.imageHeight = height || 'auto';
                
                console.log(`Image size preferences saved: ${width} x ${height}`);
            } else {
                questionObj.image = imagePreview.src;
            }
        }
        
        // Add to questions array
        questions.push(questionObj);
    });
    
    // Get quiz description
    const quizDescription = document.getElementById('quiz-description').value || 'No description';
    
    // Set category to My Quizzes only
    const category = "My Quizzes";
    
    // Get time limit
    const timeInput = document.getElementById('time-limit');
    let timeLimit = 60; // Default to 60 minutes
    
    if (timeInput && timeInput.value) {
        timeLimit = parseInt(timeInput.value);
        // Validate time limit (minimum 1 minute, maximum 180 minutes)
        if (isNaN(timeLimit) || timeLimit < 1) {
            timeLimit = 1; // Minimum 1 minute
        } else if (timeLimit > 180) {
            timeLimit = 180; // Maximum 3 hours
        }
    } else if (document.getElementById('quiz-time') && document.getElementById('quiz-time').value) {
        // Fallback to quiz-time input if exists (backward compatibility)
        timeLimit = parseInt(document.getElementById('quiz-time').value);
    }
    
    console.log("Setting quiz time limit to:", timeLimit, "minutes");
    
    // Get visibility
    const isPublic = document.getElementById('quiz-visibility').value === 'Public' ? true : false;
    
    // Create quiz object
    const quiz = {
        id: Date.now().toString(),
        title: quizTitle,
        description: quizDescription,
        category: category,
        timeLimit: timeLimit,
        public: isPublic,
        questions: questions,
        createdAt: new Date().toISOString(),
        createdBy: getCurrentUser() || 'anonymous'
    };
    
    // Use offline-aware storage method
    const userQuizzes = JSON.parse(localStorage.getItem('userQuizzes')) || [];
    userQuizzes.push(quiz);
    
    // Use the enhanced storage method that supports offline sync
    saveToLocalStorageWithSync('userQuizzes', userQuizzes);
    
    // Show appropriate message based on connection status
    if (navigator.onLine) {
        alert('Quiz created successfully!');
    } else {
        alert('Quiz saved locally. It will sync when you are back online.');
    }
    
    // Update user stats
    updateUserStats('quizzesCreated');
    
    // Reset form
    document.getElementById('create-quiz-form').reset();
    
    // Go back to categories screen and show the new quiz
    showScreen('categories-screen');
    updateCategoriesWithUserQuizzes();
}

// Function to reset quiz creation form
function resetQuizCreationForm() {
    document.getElementById('quiz-title').value = '';
    document.getElementById('quiz-description').value = '';
    document.getElementById('time-limit').value = '10';
    document.getElementById('quiz-visibility').value = 'Public';
    
    // Reset questions (keep only one)
    const questionList = document.getElementById('question-list');
    const questions = questionList.querySelectorAll('.question-item');
    
    // Remove all questions except the first one
    for (let i = 1; i < questions.length; i++) {
        questions[i].remove();
    }
    
    // Clear first question inputs
    if (questions.length > 0) {
        const firstQuestion = questions[0];
        firstQuestion.querySelector('.question-text').value = '';
        
        const options = firstQuestion.querySelectorAll('.answer-option input[type="text"]');
        options.forEach(option => {
            option.value = '';
        });
        
        const checkboxes = firstQuestion.querySelectorAll('input[type="checkbox"]');
        checkboxes.forEach(checkbox => {
            checkbox.checked = false;
        });
    }
    
    // Reset question counter
    questionCount = 1;
    
    // Reset question images
    questionImages = {};
    
    // Update question counter display
    updateQuestionCounter();
}

// Function to update the question counter display
function updateQuestionCounter() {
    const questionCounter = document.querySelector('.question-counter');
    const questionList = document.getElementById('question-list');
    const currentCount = questionList.querySelectorAll('.question-item').length;
    
    if (questionCounter) {
        questionCounter.textContent = `${currentCount}/45`;
    }
}

// Function to preview question image
function previewQuestionImage(input, questionIndex) {
    if (input.files && input.files[0]) {
        const reader = new FileReader();
        
        reader.onload = function(e) {
            // Get the question element
            const questionElement = document.querySelectorAll('.question-item')[questionIndex];
            
            // Find the image preview element
            const preview = questionElement.querySelector('.question-image-preview');
            const removeBtn = questionElement.querySelector('.remove-image-btn');
            const previewArea = questionElement.querySelector('.image-preview-area');
            
            if (preview && removeBtn && previewArea) {
                // Clear existing content and reset styles
                previewArea.innerHTML = '';
                
                // Remove any existing size controls
                const existingControls = questionElement.querySelector('.image-size-controls');
                if (existingControls) {
                    existingControls.remove();
                }
                
                // Make preview area more prominent
                previewArea.style.display = 'flex';
                previewArea.style.flexDirection = 'column';
                previewArea.style.alignItems = 'center';
                previewArea.style.minHeight = '350px';
                previewArea.style.padding = '15px';
                previewArea.style.backgroundColor = '#f9f9f9';
                previewArea.style.borderRadius = '8px';
                previewArea.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.1)';
                previewArea.style.marginBottom = '25px';
                
                // Create a new image element
                const newImage = document.createElement('img');
                newImage.className = 'question-image-preview';
                newImage.src = e.target.result;
                newImage.style.display = 'block';
                newImage.style.maxWidth = '100%';
                newImage.style.objectFit = 'contain';
                
                // Add image to preview area
                previewArea.appendChild(newImage);
                
                // Apply resize functionality
                makeImageResizable(newImage, previewArea);
                
                // Show the remove button
                removeBtn.style.display = 'inline-block';
                
                // Save image data
                const img = new Image();
                img.onload = function() {
                    // Store the image dimensions and data
                    questionElement.dataset.imageWidth = this.width;
                    questionElement.dataset.imageHeight = this.height;
                    questionElement.dataset.imageData = e.target.result;
                    
                    console.log(`Image preview set for question ${questionIndex + 1} with resizing controls`);
                };
                img.src = e.target.result;
            } else {
                console.error('Could not find preview elements');
            }
        };
        
        reader.readAsDataURL(input.files[0]);
    }
}

// Function to remove a question image
function removeQuestionImage(questionIndex) {
    // Get the question element
    const questionElement = document.querySelectorAll('.question-item')[questionIndex];
    
    // Find the image preview element
    const preview = questionElement.querySelector('.question-image-preview');
    const removeBtn = questionElement.querySelector('.remove-image-btn');
    const previewArea = questionElement.querySelector('.image-preview-area');
    
    if (preview && removeBtn) {
        // Clear and hide the image
        preview.src = '';
        preview.style.display = 'none';
        if (previewArea) previewArea.style.display = 'none';
        removeBtn.style.display = 'none';
        
        // Also clear the file input
        const fileInput = questionElement.querySelector('.question-image-input');
        if (fileInput) {
            fileInput.value = '';
        }
        
        // Reset any custom styles
        preview.style.maxWidth = '';
        preview.style.maxHeight = '';
        
        console.log(`Image removed from question ${questionIndex + 1}`);
    }
}

// Function to handle login
function handleLogin() {
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;
    const rememberMe = document.getElementById('remember-me').checked;
    
    // Clear any existing error messages
    clearValidationErrors('login-form');
    
    // Hide notification if it's visible
    const notification = document.getElementById('login-notification');
    if (notification) {
        notification.style.display = 'none';
    }
    
    // Hide social login notification if it's visible
    const socialNotification = document.getElementById('social-login-notification');
    if (socialNotification) {
        socialNotification.style.display = 'none';
    }
    
    // Validate inputs
    let isValid = true;
    
    // Check for empty fields
    if (!email) {
        showValidationError('login-email', 'Email is required');
        isValid = false;
    } else if (!validateEmail(email)) {
        showValidationError('login-email', 'Please enter a valid email address');
        isValid = false;
    }
    
    if (!password) {
        showValidationError('login-password', 'Password is required');
        isValid = false;
    }
    
    if (!isValid) return;
    
    // Check if user is registered
    const users = JSON.parse(localStorage.getItem('registeredUsers')) || [];
    let user = users.find(user => user.email === email);
    
    if (!user) {
        // Check if this email is connected to an existing account as a social login
        const userWithSocialConnection = users.find(u => 
            u.socialConnections && 
            ((u.socialConnections.google && u.socialConnections.google.email === email) || 
            (u.socialConnections.facebook && u.socialConnections.facebook.email === email))
        );
        
        if (userWithSocialConnection) {
            // Email is connected to an account, login with the main account
            user = userWithSocialConnection;
        } else {
            // Show friendly notification for non-existent user
            if (notification) {
                notification.style.display = 'block';
            }
            return;
        }
    }
    
    // Check if this is a social login account (standalone, not connected)
    if (user.socialLogin) {
        // Show social login notification
        if (socialNotification) {
            socialNotification.style.display = 'block';
            
            // Clear form errors
            clearValidationErrors('login-form');
        }
        return;
    }
    
    // Check password for regular accounts (not needed for connected social accounts)
    if (!user.socialConnections || 
        !(user.socialConnections.google && user.socialConnections.google.email === email) && 
        !(user.socialConnections.facebook && user.socialConnections.facebook.email === email)) {
        
        if (user.password !== password) {
            showValidationError('login-password', 'Invalid password');
            return;
        }
    }
    
    // Login successful
    showScreen('categories-screen');
    
    // Save login info to localStorage or sessionStorage based on remember me
    if (rememberMe) {
        // If remember me is checked, store in localStorage (persists across browser sessions)
        localStorage.setItem('user_email', user.email); // Always store the main account email
        localStorage.setItem('remember_me', 'true');
    } else {
        // If remember me is not checked, use sessionStorage (cleared when browser is closed)
        sessionStorage.setItem('user_email', user.email); // Always store the main account email
        localStorage.removeItem('remember_me');
    }
}

// Function to handle signup
function handleSignup() {
    const email = document.getElementById('signup-email').value;
    const password = document.getElementById('signup-password').value;
    const confirmPassword = document.getElementById('signup-confirm-password').value;
    
    // Clear any existing error messages
    clearValidationErrors('signup-form');
    
    // Validate inputs
    let isValid = true;
    
    // Check for empty fields
    if (!email) {
        showValidationError('signup-email', 'Email is required');
        isValid = false;
    } else if (!validateEmail(email)) {
        showValidationError('signup-email', 'Please enter a valid email address');
        isValid = false;
    }
    
    if (!password) {
        showValidationError('signup-password', 'Password is required');
        isValid = false;
    } else if (password.length < 6) {
        showValidationError('signup-password', 'Password must be at least 6 characters');
        isValid = false;
    }
    
    if (!confirmPassword) {
        showValidationError('signup-confirm-password', 'Please confirm your password');
        isValid = false;
    } else if (password !== confirmPassword) {
        showValidationError('signup-confirm-password', 'Passwords do not match');
        isValid = false;
    }
    
    if (!isValid) return;
    
    // Check if email is already registered
    const users = JSON.parse(localStorage.getItem('registeredUsers')) || [];
    if (users.some(user => user.email === email)) {
        showValidationError('signup-email', 'This email is already registered');
        return;
    }
    
    // Generate verification code
    const verificationCode = generateVerificationCode();
    
    // Store signup data temporarily
    const pendingSignup = {
        email: email,
        password: password,
        verificationCode: verificationCode,
        expiresAt: Date.now() + (30 * 60 * 1000) // 30 minutes expiry
    };
    
    // Save pending signup
    localStorage.setItem('pendingSignup', JSON.stringify(pendingSignup));
    
    // Show verification screen
    showVerificationScreen(email, verificationCode);
}

// Function to generate a random 6-digit verification code
function generateVerificationCode() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

// Function to send verification code via Netlify function
function sendVerificationCode(method, email, phone, code) {
    // Show loading indicator
    showToast(`Sending verification code...`, 2000);
    
    // Call the Netlify function
    fetch('/.netlify/functions/send-verification', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            method: method,
            email: email,
            phone: phone,
            code: code
        })
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            showToast(data.message, 3000);
            // For development, show the code
            if (data.debug) {
                setTimeout(() => {
                    showToast(data.debug, 5000);
                }, 3100);
            }
        } else {
            showVerificationError(data.message || 'Failed to send verification code');
        }
    })
    .catch(error => {
        console.error('Error sending verification code:', error);
        showVerificationError('Could not send verification code. Please try again.');
        
        // For development, show the code anyway
        showToast(`Code: ${code}`, 5000);
    });
}

// Function to show verification screen
function showVerificationScreen(email, code) {
    // Create verification screen if it doesn't exist
    let verificationScreen = document.getElementById('verification-screen');
    
    if (!verificationScreen) {
        verificationScreen = document.createElement('div');
        verificationScreen.id = 'verification-screen';
        verificationScreen.className = 'screen';
        verificationScreen.innerHTML = `
            <div class="screen-header">
                <h1>Verify Account</h1>
            </div>
            <div class="auth-content">
                <div class="verify-tabs">
                    <button id="email-tab" class="verify-tab active">Email</button>
                    <button id="sms-tab" class="verify-tab">SMS</button>
                </div>
                
                <div id="email-verify" class="verify-method active">
                    <p class="verification-message">Enter the code sent to:</p>
                    <p class="verification-email"></p>
                </div>
                
                <div id="sms-verify" class="verify-method">
                    <div class="form-group sms-input-group">
                        <input type="tel" id="phone-number" placeholder="Phone number" class="sms-input">
                        <button id="send-sms-btn" class="sms-button">Send</button>
                    </div>
                </div>
                
                <div class="verification-code-container">
                    <input type="text" maxlength="1" class="verification-digit" pattern="[0-9]" inputmode="numeric">
                    <input type="text" maxlength="1" class="verification-digit" pattern="[0-9]" inputmode="numeric">
                    <input type="text" maxlength="1" class="verification-digit" pattern="[0-9]" inputmode="numeric">
                    <input type="text" maxlength="1" class="verification-digit" pattern="[0-9]" inputmode="numeric">
                    <input type="text" maxlength="1" class="verification-digit" pattern="[0-9]" inputmode="numeric">
                    <input type="text" maxlength="1" class="verification-digit" pattern="[0-9]" inputmode="numeric">
                </div>
                
                <div id="verification-error" class="auth-error" style="display: none;"></div>
                
                <button id="verify-code-btn" class="primary-button">Verify</button>
                
                <div class="auth-links">
                    <a href="#" id="resend-code">Resend Code</a>
                    <a href="#" id="change-email">Back</a>
                </div>
            </div>
        `;
        
        document.body.appendChild(verificationScreen);
        
        // Setup handlers for the verification screen
        setupVerificationInputHandlers();
        
        // Verify button
        const verifyBtn = document.getElementById('verify-code-btn');
        if (verifyBtn) {
            verifyBtn.addEventListener('click', validateVerificationCode);
        }
        
        // Resend code link
        const resendLink = document.getElementById('resend-code');
        if (resendLink) {
            resendLink.addEventListener('click', function(e) {
                e.preventDefault();
                
                // Check if SMS tab is active
                const smsActive = document.getElementById('sms-tab').classList.contains('active');
                if (smsActive) {
                    // Resend SMS
                    const phoneInput = document.getElementById('phone-number');
                    if (phoneInput && phoneInput.value.trim()) {
                        const newCode = generateVerificationCode();
                        sendVerificationCode('sms', null, phoneInput.value.trim(), newCode);
                        
                        // Update pending signup with new code
                        updateVerificationCode(newCode);
                    } else {
                        showVerificationError('Please enter a phone number first');
                    }
                } else {
                    // Resend email
                    resendVerificationCode();
                }
            });
        }
        
        // Change email link
        const changeLink = document.getElementById('change-email');
        if (changeLink) {
            changeLink.addEventListener('click', function(e) {
                e.preventDefault();
                showScreen('auth-screen');
                toggleAuthForms('signup');
            });
        }
        
        // Tab switching
        const emailTab = document.getElementById('email-tab');
        const smsTab = document.getElementById('sms-tab');
        if (emailTab && smsTab) {
            emailTab.addEventListener('click', function() {
                document.getElementById('email-tab').classList.add('active');
                document.getElementById('sms-tab').classList.remove('active');
                document.getElementById('email-verify').classList.add('active');
                document.getElementById('sms-verify').classList.remove('active');
            });
            
            smsTab.addEventListener('click', function() {
                document.getElementById('sms-tab').classList.add('active');
                document.getElementById('email-tab').classList.remove('active');
                document.getElementById('sms-verify').classList.add('active');
                document.getElementById('email-verify').classList.remove('active');
            });
        }
        
        // SMS send button
        const sendSmsBtn = document.getElementById('send-sms-btn');
        if (sendSmsBtn) {
            sendSmsBtn.addEventListener('click', function() {
                const phoneInput = document.getElementById('phone-number');
                if (phoneInput && phoneInput.value.trim()) {
                    const pendingSignup = JSON.parse(localStorage.getItem('pendingSignup'));
                    if (pendingSignup) {
                        sendVerificationCode('sms', null, phoneInput.value.trim(), pendingSignup.verificationCode);
                    } else {
                        showVerificationError('Session expired. Please try signing up again.');
                    }
                } else {
                    showVerificationError('Please enter a valid phone number');
                }
            });
        }
    }
    
    // Update email display
    const emailDisplay = verificationScreen.querySelector('.verification-email');
    if (emailDisplay) {
        emailDisplay.textContent = email;
    }
    
    // Clear verification inputs
    const inputs = verificationScreen.querySelectorAll('.verification-digit');
    inputs.forEach(input => {
        input.value = '';
    });
    
    // Hide error message if any
    const errorElement = document.getElementById('verification-error');
    if (errorElement) {
        errorElement.style.display = 'none';
    }
    
    // Show verification screen
    showScreen('verification-screen');
    
    // Send verification code via email through Netlify function
    sendVerificationCode('email', email, null, code);
    
    // Focus on first input
    if (inputs.length > 0) {
        setTimeout(() => {
            inputs[0].focus();
        }, 300);
    }
}

// Setup input handlers for verification code
function setupVerificationInputHandlers() {
    const inputs = document.querySelectorAll('.verification-digit');
    
    inputs.forEach((input, index) => {
        // Handle input
        input.addEventListener('input', function(e) {
            // Ensure it's a number
            const value = e.target.value;
            if (!/^[0-9]$/.test(value)) {
                e.target.value = '';
                return;
            }
            
            // Move to next input if available
            if (index < inputs.length - 1 && value) {
                inputs[index + 1].focus();
            }
            
            // Check if all inputs are filled
            if (Array.from(inputs).every(input => input.value)) {
                validateVerificationCode();
            }
        });
        
        // Handle keypresses
        input.addEventListener('keydown', function(e) {
            // Move to previous input on backspace if current is empty
            if (e.key === 'Backspace' && !e.target.value && index > 0) {
                inputs[index - 1].focus();
            }
        });
        
        // Handle paste
        input.addEventListener('paste', function(e) {
            e.preventDefault();
            const pastedData = e.clipboardData.getData('text');
            
            // If pasted data is a 6-digit number, fill all inputs
            if (/^\d{6}$/.test(pastedData)) {
                inputs.forEach((input, i) => {
                    input.value = pastedData[i];
                });
                
                // Validate code after filling
                validateVerificationCode();
            }
        });
    });
}

// Function to validate verification code
function validateVerificationCode() {
    // Get entered code
    const inputs = document.querySelectorAll('.verification-digit');
    const enteredCode = Array.from(inputs).map(input => input.value).join('');
    
    // Get pending signup info
    const pendingSignup = JSON.parse(localStorage.getItem('pendingSignup'));
    
    if (!pendingSignup) {
        showVerificationError('Session expired. Please try signing up again.');
        return;
    }
    
    // Check if verification code has expired
    if (Date.now() > pendingSignup.expiresAt) {
        showVerificationError('Verification code has expired. Please request a new one.');
        return;
    }
    
    // Check if code matches
    if (enteredCode === pendingSignup.verificationCode) {
        // Complete registration
        completeRegistration(pendingSignup);
    } else {
        showVerificationError('Invalid verification code. Please try again.');
    }
}

// Function to show verification error
function showVerificationError(message) {
    const errorElement = document.getElementById('verification-error');
    if (errorElement) {
        errorElement.textContent = message;
        errorElement.style.display = 'block';
    }
}

// Function to complete registration after verification
function completeRegistration(pendingSignup) {
    // Get existing users
    const users = JSON.parse(localStorage.getItem('registeredUsers')) || [];
    
    // Add the new user
    users.push({ 
        email: pendingSignup.email, 
        password: pendingSignup.password,
        verified: true,
        registeredAt: Date.now()
    });
    
    // Update localStorage
    localStorage.setItem('registeredUsers', JSON.stringify(users));
    
    // Clear pending signup
    localStorage.removeItem('pendingSignup');
    
    // Create default profile
    userProfile.name = pendingSignup.email.split('@')[0]; // Use part before @ as name
    userProfile.username = pendingSignup.email.split('@')[0];
    localStorage.setItem('userProfile', JSON.stringify(userProfile));
    
    // Save login info to localStorage
    localStorage.setItem('user_email', pendingSignup.email);
    
    // Show success animation
    showRegistrationSuccess();
}

// Function to show registration success
function showRegistrationSuccess() {
    // Create success overlay
    let successOverlay = document.createElement('div');
    successOverlay.className = 'registration-success-overlay';
    successOverlay.style.position = 'fixed';
    successOverlay.style.top = '0';
    successOverlay.style.left = '0';
    successOverlay.style.width = '100%';
    successOverlay.style.height = '100%';
    successOverlay.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
    successOverlay.style.display = 'flex';
    successOverlay.style.flexDirection = 'column';
    successOverlay.style.alignItems = 'center';
    successOverlay.style.justifyContent = 'center';
    successOverlay.style.zIndex = '9999';
    
    successOverlay.innerHTML = `
        <div style="background-color: white; border-radius: 15px; padding: 30px; max-width: 80%; display: flex; flex-direction: column; align-items: center; box-shadow: 0 10px 25px rgba(0,0,0,0.2);">
            <div style="width: 80px; height: 80px; border-radius: 50%; background-color: #4CAF50; display: flex; align-items: center; justify-content: center; margin-bottom: 20px;">
                <span style="color: white; font-size: 40px;">✓</span>
            </div>
            <h2 style="color: #333; margin-bottom: 15px; font-size: 24px;">Registration Complete!</h2>
            <p style="color: #666; margin-bottom: 25px; text-align: center; font-size: 16px;">Your account has been successfully created.<br>Welcome to NET Quiz!</p>
        </div>
    `;
    
    document.body.appendChild(successOverlay);
    
    // Redirect to categories screen after showing success
    setTimeout(() => {
        document.body.removeChild(successOverlay);
        showScreen('categories-screen');
    }, 2500);
}

// Function to resend verification code
function resendVerificationCode() {
    // Get pending signup
    const pendingSignup = JSON.parse(localStorage.getItem('pendingSignup'));
    
    if (!pendingSignup) {
        showVerificationError('Session expired. Please try signing up again.');
        return;
    }
    
    // Generate new verification code
    const newCode = generateVerificationCode();
    
    // Update pending signup
    pendingSignup.verificationCode = newCode;
    pendingSignup.expiresAt = Date.now() + (30 * 60 * 1000); // Reset 30-minute expiry
    
    // Save updated pending signup
    localStorage.setItem('pendingSignup', JSON.stringify(pendingSignup));
    
    // Send the new code via email using the Netlify function
    sendVerificationCode('email', pendingSignup.email, null, newCode);
}

// Function to show validation error
function showValidationError(inputId, message) {
    const inputElement = document.getElementById(inputId);
    if (!inputElement) return;
    
    // Create error message element if it doesn't exist
    let errorElement = inputElement.nextElementSibling;
    if (!errorElement || !errorElement.classList.contains('validation-error')) {
        errorElement = document.createElement('div');
        errorElement.className = 'validation-error';
        inputElement.parentNode.insertBefore(errorElement, inputElement.nextSibling);
    }
    
    // Set error message and add error class to input
    errorElement.textContent = message;
    inputElement.classList.add('input-error');
}

// Function to clear validation errors
function clearValidationErrors(formId) {
    const form = document.getElementById(formId);
    if (!form) return;
    
    // Remove all error messages
    const errorElements = form.querySelectorAll('.validation-error');
    errorElements.forEach(element => {
        element.remove();
    });
    
    // Remove error class from inputs
    const inputElements = form.querySelectorAll('.input-error');
    inputElements.forEach(input => {
        input.classList.remove('input-error');
    });
}

// Function to validate email format
function validateEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}

// Function to handle Google login
function handleGoogleLogin() {
    console.log("Initiating Google login...");
    
    // Create a loading overlay to simulate page redirect
    showLoginRedirectOverlay('google');
    
    // Generate fake user data for demo
    const randomNum = Math.floor(Math.random() * 1000);
    const email = `user${randomNum}@gmail.com`;
    const name = `Google User ${randomNum}`;
    
    // Simulate delay and redirect
    setTimeout(() => {
        // Remove loading overlay
        hideLoginRedirectOverlay();
        
        // Process the login
        registerSocialUser(email, name, 'google');
        loginSocialUser(email, 'google', name);
        
        console.log(`Google login completed for ${email}`);
    }, 1500); // 1.5 second delay to simulate network request
}

// Function to handle Facebook login
function handleFacebookLogin() {
    console.log("Initiating Facebook login...");
    
    // Create a loading overlay to simulate page redirect
    showLoginRedirectOverlay('facebook');
    
    // Generate fake user data for demo
    const randomNum = Math.floor(Math.random() * 1000);
    const email = `user${randomNum}@facebook.com`;
    const name = `Facebook User ${randomNum}`;
    
    // Simulate delay and redirect
    setTimeout(() => {
        // Remove loading overlay
        hideLoginRedirectOverlay();
        
        // Process the login
        registerSocialUser(email, name, 'facebook');
        loginSocialUser(email, 'facebook', name);
        
        console.log(`Facebook login completed for ${email}`);
    }, 1500); // 1.5 second delay to simulate network request
}

// Function to show login redirect overlay
function showLoginRedirectOverlay(provider) {
    // Create a loading overlay
    let loadingOverlay = document.getElementById('login-redirect-overlay');
    
    if (!loadingOverlay) {
        loadingOverlay = document.createElement('div');
        loadingOverlay.id = 'login-redirect-overlay';
        loadingOverlay.style.position = 'fixed';
        loadingOverlay.style.top = '0';
        loadingOverlay.style.left = '0';
        loadingOverlay.style.width = '100%';
        loadingOverlay.style.height = '100%';
        loadingOverlay.style.backgroundColor = 'rgba(255, 255, 255, 0.9)';
        loadingOverlay.style.display = 'flex';
        loadingOverlay.style.flexDirection = 'column';
        loadingOverlay.style.justifyContent = 'center';
        loadingOverlay.style.alignItems = 'center';
        loadingOverlay.style.zIndex = '9999';
        
        // Add spinner
        const spinner = document.createElement('div');
        spinner.className = 'login-spinner';
        spinner.style.width = '50px';
        spinner.style.height = '50px';
        spinner.style.border = '5px solid #f3f3f3';
        spinner.style.borderTop = `5px solid ${provider === 'facebook' ? '#3b5998' : '#DB4437'}`;
        spinner.style.borderRadius = '50%';
        spinner.style.animation = 'spin 1s linear infinite';
        loadingOverlay.appendChild(spinner);
        
        // Add text
        const statusText = document.createElement('div');
        statusText.style.marginTop = '20px';
        statusText.style.fontSize = '16px';
        statusText.textContent = `Connecting to ${provider.charAt(0).toUpperCase() + provider.slice(1)}...`;
        loadingOverlay.appendChild(statusText);
        
        // Add CSS animation
        if (!document.getElementById('spinner-animation')) {
            const style = document.createElement('style');
            style.id = 'spinner-animation';
            style.textContent = `@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`;
            document.head.appendChild(style);
        }
        
        // Add to document
        document.body.appendChild(loadingOverlay);
    }
}

// Function to hide login redirect overlay
function hideLoginRedirectOverlay() {
    const overlay = document.getElementById('login-redirect-overlay');
    if (overlay) {
        document.body.removeChild(overlay);
    }
}

// Helper function to register a social media user
function registerSocialUser(email, name, provider) {
    console.log(`Registering social user: ${email} with ${provider}`);
    
    // Create a new user object with social connection
    const newUser = {
        email: email,
        name: name || email.split('@')[0],
        passwordHash: null, // Social users don't have passwords
        profileImage: null,
        bio: '',
        interests: [],
        dateCreated: Date.now(),
        lastLogin: Date.now(),
        socialConnections: {
            [provider]: {
                connected: true,
                email: email
            }
        },
        statistics: {
            quizzesCreated: 0,
            quizzesTaken: 0,
            correctAnswers: 0,
            totalQuestions: 0,
            logins: 1
        }
    };
    
    // Get existing users
    const users = JSON.parse(localStorage.getItem('users') || '[]');
    
    // Add new user
    users.push(newUser);
    
    // Save updated users array
    localStorage.setItem('users', JSON.stringify(users));
    
    // Set current user
    localStorage.setItem('currentUser', email);
    
    // Show success overlay
    showAuthSuccessOverlay(provider, name || email);
    
    // After success overlay, navigate to categories screen
    setTimeout(() => {
        hideAuthSuccessOverlay();
        showScreen('categories-screen');
    }, 2000);
}

// Helper function to login a social media user
function loginSocialUser(email, provider, name) {
    // Check if user exists in localStorage
    const users = JSON.parse(localStorage.getItem('users') || '[]');
    const userExists = users.some(user => user.email === email);
    
    if (userExists) {
        // Update the user's social connection information
        const updatedUsers = users.map(user => {
            if (user.email === email) {
                // Update the connection status for this provider
                if (!user.socialConnections) {
                    user.socialConnections = {};
                }
                user.socialConnections[provider] = {
                    connected: true,
                    email: email
                };
                
                // Set last login time
                user.lastLogin = Date.now();
            }
            return user;
        });
        localStorage.setItem('users', JSON.stringify(updatedUsers));
        
        // Set current user in localStorage
        localStorage.setItem('currentUser', email);
        
        // Show success overlay
        showAuthSuccessOverlay(provider, name);
        
        // Update user statistics
        updateUserStats('logins');
    } else {
        // If user doesn't exist yet, register them
        registerSocialUser(email, name, provider);
    }
    
    // Auto-connect to personal account if exists and not already connected
    const personalAccounts = users.filter(user => 
        user.email !== email && 
        (!user.socialConnections || 
         !user.socialConnections[provider] || 
         !user.socialConnections[provider].connected)
    );
    
    // If we have personal accounts that aren't connected yet
    if (personalAccounts.length > 0) {
        // Get the most recently used account
        const mostRecentAccount = personalAccounts.sort((a, b) => 
            (b.lastLogin || 0) - (a.lastLogin || 0)
        )[0];
        
        console.log(`Auto-connecting ${provider} to personal account: ${mostRecentAccount.email}`);
        
        // Update the personal account with the social connection
        updateUserSocialConnections(mostRecentAccount.email, provider, email);
        
        // Show toast notification about the connection
        setTimeout(() => {
            showToast(`Your ${provider} account has been connected to your personal account: ${mostRecentAccount.email}`);
        }, 3000); // Show this after the success overlay
    }
}

// Function to show authentication success overlay
function showAuthSuccessOverlay(provider, name) {
    // Create overlay if it doesn't exist
    let overlay = document.getElementById('auth-success-overlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'auth-success-overlay';
        overlay.style.position = 'fixed';
        overlay.style.top = '0';
        overlay.style.left = '0';
        overlay.style.width = '100%';
        overlay.style.height = '100%';
        overlay.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
        overlay.style.display = 'flex';
        overlay.style.flexDirection = 'column';
        overlay.style.alignItems = 'center';
        overlay.style.justifyContent = 'center';
        overlay.style.zIndex = '1000';
        overlay.style.color = 'white';
        overlay.style.textAlign = 'center';
        overlay.style.animation = 'fadeIn 0.5s ease-out';
        document.body.appendChild(overlay);
    } else {
        overlay.style.display = 'flex';
    }
    
    // Create content for the overlay
    overlay.innerHTML = `
        <div style="background-color: white; border-radius: 15px; padding: 30px; max-width: 80%; display: flex; flex-direction: column; align-items: center; box-shadow: 0 10px 25px rgba(0,0,0,0.2);">
            <div style="width: 70px; height: 70px; border-radius: 50%; background-color: #4CAF50; display: flex; align-items: center; justify-content: center; margin-bottom: 20px;">
                <span style="color: white; font-size: 40px;">✓</span>
            </div>
            <h2 style="color: #333; margin-bottom: 15px; font-size: 22px;">Login Successful</h2>
            <p style="color: #666; margin-bottom: 15px; font-size: 16px;">Welcome ${name || 'back'}!</p>
            <p style="color: #888; font-size: 14px;">Connected with ${provider}</p>
        </div>
    `;
    
    // After a short delay, automatically redirect
    setTimeout(() => {
        hideAuthSuccessOverlay();
        showScreen('categories-screen');
    }, 2000);
}

// Function to hide authentication success overlay
function hideAuthSuccessOverlay() {
    const overlay = document.getElementById('auth-success-overlay');
    if (overlay) {
        overlay.style.display = 'none';
    }
}

// Function to update user statistics
function updateUserStats(statName) {
    // Get current user profile
    const userProfile = JSON.parse(localStorage.getItem('userProfile')) || {
        stats: {
            quizzes: 0,
            accuracy: '0%',
            rank: 0,
            quizzesCreated: 0
        }
    };
    
    // Update requested stat
    if (statName === 'quizzesCreated') {
        userProfile.stats.quizzesCreated = (userProfile.stats.quizzesCreated || 0) + 1;
        userProfile.stats.quizzes = userProfile.stats.quizzesCreated;
    }
    
    // Save back to localStorage
    localStorage.setItem('userProfile', JSON.stringify(userProfile));
}

// Function to update user statistics
function updateUserStatistics(score, totalQuestions) {
    // Get user profile
    const userProfile = JSON.parse(localStorage.getItem('userProfile')) || {
        stats: {
            quizzes: 0,
            accuracy: '0%',
            rank: 0,
            quizzesCreated: 0,
            totalAnswered: 0,
            correctAnswers: 0
        }
    };
    
    // Update quiz count
    userProfile.stats.quizzes++;
    
    // Update total questions and correct answers
    userProfile.stats.totalAnswered = (userProfile.stats.totalAnswered || 0) + totalQuestions;
    userProfile.stats.correctAnswers = (userProfile.stats.correctAnswers || 0) + score;
    
    // Calculate and update accuracy
    if (userProfile.stats.totalAnswered > 0) {
        const accuracyPercent = Math.round((userProfile.stats.correctAnswers / userProfile.stats.totalAnswered) * 100);
        userProfile.stats.accuracy = accuracyPercent + '%';
    }
    
    // Update rank based on correct answers
    if (userProfile.stats.correctAnswers >= 500) {
        userProfile.stats.rank = 'Expert';
    } else if (userProfile.stats.correctAnswers >= 200) {
        userProfile.stats.rank = 'Advanced';
    } else if (userProfile.stats.correctAnswers >= 50) {
        userProfile.stats.rank = 'Intermediate';
    } else {
        userProfile.stats.rank = 'Beginner';
    }
    
    // Save back to localStorage
    localStorage.setItem('userProfile', JSON.stringify(userProfile));
    
    console.log('User statistics updated:', userProfile.stats);
}

// Initialize the application when the DOM is fully loaded
document.addEventListener('DOMContentLoaded', function() {
    // Check for saved login credentials
    checkSavedLogin();
    
    // Show login form by default
    toggleAuthForms('login');
    
    // Set up real-time validation for form inputs
    setupFormValidation();
    
    // Add event listeners to category items
    const categoryItems = document.querySelectorAll('.category-item');
    categoryItems.forEach(item => {
        item.addEventListener('click', function() {
            const categoryName = this.querySelector('.category-name').textContent;
            loadQuizByCategory(categoryName);
        });
    });
    
    // Set up interest tag event listeners
    const interestTags = document.querySelectorAll('.interest-tag');
    interestTags.forEach(tag => {
        tag.addEventListener('click', toggleInterestTag);
    });
    
    // Add event listener for quiz creation form submission
    const createQuizForm = document.getElementById('create-quiz-form');
    if (createQuizForm) {
        createQuizForm.addEventListener('submit', createQuiz);
    }
    
    // Add event listener for the save quiz button
    const saveQuizButton = document.getElementById('save-quiz-button');
    if (saveQuizButton) {
        saveQuizButton.addEventListener('click', function(event) {
            event.preventDefault();
            createQuiz(event);
        });
    }
    
    // Load user created quizzes from localStorage
    const savedQuizzes = localStorage.getItem('userCreatedQuizzes');
    if (savedQuizzes) {
        userCreatedQuizzes = JSON.parse(savedQuizzes);
        
        // Add user created quizzes to the main quizzes array
        userCreatedQuizzes.forEach(uQuiz => {
            const existingCategory = quizzes.find(q => q.category === uQuiz.category);
            if (existingCategory) {
                // Add questions to existing category
                uQuiz.questions.forEach(q => {
                    // Only add if not already in the array
                    const questionExists = existingCategory.questions.some(eq => eq.text === q.text);
                    if (!questionExists) {
                        existingCategory.questions.push(q);
                    }
                });
            } else {
                // Create new category
                quizzes.push({
                    category: uQuiz.category,
                    questions: uQuiz.questions
                });
            }
        });
        
        // Update category count display
        const categoryCount = document.querySelector('.category-count');
        if (categoryCount) {
            const questionCount = quizzes.find(q => q.category === 'teori test')?.questions.length || 0;
            categoryCount.textContent = `${questionCount} Quizzes`;
        }
    }
    
    // Show profile screen when showScreen('profile-screen') is called
    document.getElementById('profile-screen').addEventListener('show', function() {
        loadUserProfile();
    });
    
    // Custom event listener for showScreen function
    const originalShowScreen = showScreen;
    window.showScreen = function(screenId) {
        originalShowScreen(screenId);
        
        // Dispatch custom event when showing profile screen
        if (screenId === 'profile-screen') {
            loadUserProfile();
        }
        
        // Reset quiz creation form when showing the creation screen
        if (screenId === 'quiz-creation-screen') {
            resetQuizCreationForm();
            updateQuestionCounter();
        }
    };
    
    // Add this near the end of the DOMContentLoaded function
    updateCategoriesWithUserQuizzes();
    
    // Also update after quiz creation
    // Find the resetQuizCreationForm function and add to the end:
    const originalResetQuizCreationForm = resetQuizCreationForm;
    resetQuizCreationForm = function() {
        originalResetQuizCreationForm();
        updateCategoriesWithUserQuizzes();
    };
    
    // Initialize offline support
    initializeOfflineSupport();
    
    // Replace your storage functions with offline-aware versions
    // For example, use saveToLocalStorageWithSync instead of localStorage.setItem
    // Example: when saving a quiz
    
    // Modify your existing createQuiz function to use the new storage method
    if (typeof createQuiz === 'function') {
        const originalCreateQuiz = createQuiz;
        
        createQuiz = function(event) {
            // Call original function first
            const result = originalCreateQuiz.apply(this, arguments);
            
            // Then trigger background sync if needed
            if (!navigator.onLine) {
                registerBackgroundSync();
            }
            
            return result;
        };
    }
});

// Function to set up real-time validation for form inputs
function setupFormValidation() {
    // Login form validation
    const loginEmail = document.getElementById('login-email');
    const loginPassword = document.getElementById('login-password');
    
    if (loginEmail) {
        loginEmail.addEventListener('blur', function() {
            validateField(this, 'Email is required', !this.value);
            
            if (this.value && !validateEmail(this.value)) {
                validateField(this, 'Please enter a valid email address', true);
            }
        });
    }
    
    if (loginPassword) {
        loginPassword.addEventListener('blur', function() {
            validateField(this, 'Password is required', !this.value);
        });
    }
    
    // Signup form validation
    const signupEmail = document.getElementById('signup-email');
    const signupPassword = document.getElementById('signup-password');
    const signupConfirmPassword = document.getElementById('signup-confirm-password');
    
    if (signupEmail) {
        signupEmail.addEventListener('blur', function() {
            validateField(this, 'Email is required', !this.value);
            
            if (this.value && !validateEmail(this.value)) {
                validateField(this, 'Please enter a valid email address', true);
            }
        });
    }
    
    if (signupPassword) {
        signupPassword.addEventListener('blur', function() {
            validateField(this, 'Password is required', !this.value);
            
            if (this.value && this.value.length < 6) {
                validateField(this, 'Password must be at least 6 characters', true);
            }
            
            // Check password match if confirm password has a value
            const confirmPwd = document.getElementById('signup-confirm-password');
            if (confirmPwd && confirmPwd.value) {
                validateField(confirmPwd, 'Passwords do not match', this.value !== confirmPwd.value);
            }
        });
    }
    
    if (signupConfirmPassword) {
        signupConfirmPassword.addEventListener('blur', function() {
            validateField(this, 'Please confirm your password', !this.value);
            
            const pwd = document.getElementById('signup-password');
            if (this.value && pwd && pwd.value) {
                validateField(this, 'Passwords do not match', this.value !== pwd.value);
            }
        });
    }
}

// Helper function for field validation
function validateField(inputElement, errorMessage, hasError) {
    // Remove any existing error message
    let errorElement = inputElement.nextElementSibling;
    if (errorElement && errorElement.classList.contains('validation-error')) {
        errorElement.remove();
    }
    
    // Remove error class
    inputElement.classList.remove('input-error');
    
    // If there's an error, show it
    if (hasError) {
        // Create and add error message
        errorElement = document.createElement('div');
        errorElement.className = 'validation-error';
        errorElement.textContent = errorMessage;
        inputElement.parentNode.insertBefore(errorElement, inputElement.nextSibling);
        
        // Add error class to input
        inputElement.classList.add('input-error');
    }
}

// Function to check for saved login credentials
function checkSavedLogin() {
    // Check if remember me was previously checked
    const rememberMe = localStorage.getItem('remember_me') === 'true';
    
    if (rememberMe) {
        // Get saved email from localStorage
        const savedEmail = localStorage.getItem('user_email');
        
        if (savedEmail) {
            // Fill in the email field
            const emailInput = document.getElementById('login-email');
            if (emailInput) {
                emailInput.value = savedEmail;
            }
            
            // Check the remember me box
            const rememberMeCheckbox = document.getElementById('remember-me');
            if (rememberMeCheckbox) {
                rememberMeCheckbox.checked = true;
            }
            
            // Focus on password field for convenience
            setTimeout(() => {
                const passwordInput = document.getElementById('login-password');
                if (passwordInput) {
                    passwordInput.focus();
                }
            }, 500);
        }
    }
}

// Function to connect Google account to existing user
function connectGoogleAccount() {
    // Check if user is logged in
    const currentUserEmail = localStorage.getItem('user_email');
    if (!currentUserEmail) {
        alert('You must be logged in to connect a social account');
        return;
    }
    
    // Simulate Google OAuth flow
    const randomId = Math.floor(Math.random() * 1000000).toString();
    const googleEmail = `user${randomId}@gmail.com`;
    
    // Add Google connection to the user account
    updateUserSocialConnections(currentUserEmail, 'google', googleEmail);
    
    // Show success message
    alert('Google account connected successfully!');
    
    // Refresh profile if on profile screen
    if (document.getElementById('profile-screen').style.display === 'block') {
        loadUserProfile();
    }
}

// Function to connect Facebook account to existing user
function connectFacebookAccount() {
    // Check if user is logged in
    const currentUserEmail = localStorage.getItem('user_email');
    if (!currentUserEmail) {
        alert('You must be logged in to connect a social account');
        return;
    }
    
    // Simulate Facebook OAuth flow
    const randomId = Math.floor(Math.random() * 1000000).toString();
    const facebookEmail = `user${randomId}@facebook.com`;
    
    // Add Facebook connection to the user account
    updateUserSocialConnections(currentUserEmail, 'facebook', facebookEmail);
    
    // Show success message
    alert('Facebook account connected successfully!');
    
    // Refresh profile if on profile screen
    if (document.getElementById('profile-screen').style.display === 'block') {
        loadUserProfile();
    }
}

// Helper function to update user social connections
function updateUserSocialConnections(userEmail, provider, socialEmail) {
    // Get existing users
    const users = JSON.parse(localStorage.getItem('registeredUsers')) || [];
    
    // Find the user
    const userIndex = users.findIndex(user => user.email === userEmail);
    if (userIndex === -1) return;
    
    // Initialize social connections if it doesn't exist
    if (!users[userIndex].socialConnections) {
        users[userIndex].socialConnections = {};
    }
    
    // Add/update the social connection
    users[userIndex].socialConnections[provider] = {
        email: socialEmail,
        connectedAt: new Date().toISOString()
    };
    
    // Save back to localStorage
    localStorage.setItem('registeredUsers', JSON.stringify(users));
}

// Function to disconnect social account
function disconnectSocialAccount(provider) {
    // Check if user is logged in
    const currentUserEmail = localStorage.getItem('user_email');
    if (!currentUserEmail) return;
    
    // Get existing users
    const users = JSON.parse(localStorage.getItem('registeredUsers')) || [];
    
    // Find the user
    const userIndex = users.findIndex(user => user.email === currentUserEmail);
    if (userIndex === -1) return;
    
    // Check if user has social connections
    if (!users[userIndex].socialConnections || !users[userIndex].socialConnections[provider]) {
        return;
    }
    
    // Remove the social connection
    delete users[userIndex].socialConnections[provider];
    
    // Save back to localStorage
    localStorage.setItem('registeredUsers', JSON.stringify(users));
    
    // Show success message
    alert(`${provider.charAt(0).toUpperCase() + provider.slice(1)} account disconnected`);
    
    // Refresh profile
    loadUserProfile();
}

// Function to update categories screen to show user created quizzes
function updateCategoriesWithUserQuizzes() {
    // Get user quizzes from local storage
    const userQuizzes = JSON.parse(localStorage.getItem('userQuizzes')) || [];
    
    if (userQuizzes.length === 0) {
        // No user quizzes to display
        return;
    }
    
    // Find or create user quizzes section
    let userQuizzesSection = document.querySelector('.user-quizzes-section');
    if (!userQuizzesSection) {
        // Create a new section for user quizzes if it doesn't exist
        userQuizzesSection = document.createElement('section');
        userQuizzesSection.className = 'user-quizzes-section';
        userQuizzesSection.innerHTML = `
            <h2>My Created Quizzes</h2>
            <div class="user-quizzes-container"></div>
        `;
        
        // Get categories container and append this section after it
        const categoriesContainer = document.querySelector('.categories-grid');
        if (categoriesContainer) {
            categoriesContainer.parentNode.insertBefore(userQuizzesSection, categoriesContainer.nextSibling);
        }
    }
    
    // Get the container for user quizzes
    const userQuizzesContainer = userQuizzesSection.querySelector('.user-quizzes-container');
    if (!userQuizzesContainer) return;
    
    // Clear existing content
    userQuizzesContainer.innerHTML = '';
    
    // Add each quiz to the container
    userQuizzes.forEach(quiz => {
        const quizItem = document.createElement('div');
        quizItem.className = 'category-item custom-quiz-item';
        quizItem.innerHTML = `
            <div class="category-icon">📝</div>
            <div class="category-name">${quiz.title}</div>
            <div class="category-count">${quiz.questions.length} questions</div>
        `;
        
        quizItem.addEventListener('click', () => {
            startQuizWithCustomQuestions(quiz);
        });
        
        userQuizzesContainer.appendChild(quizItem);
    });
}

// Function to show My Quizzes screen
function showMyQuizzesScreen() {
    // Get user created quizzes
    const userQuizzes = JSON.parse(localStorage.getItem('userCreatedQuizzes')) || [];
    
    // Check if My Quizzes screen exists
    let myQuizzesScreen = document.getElementById('my-quizzes-screen');
    
    if (!myQuizzesScreen) {
        // Create the screen
        myQuizzesScreen = document.createElement('div');
        myQuizzesScreen.id = 'my-quizzes-screen';
        myQuizzesScreen.className = 'screen';
        myQuizzesScreen.innerHTML = `
            <div class="screen-header">
                <button class="back-button" onclick="showScreen('categories-screen')">
                    <span class="back-arrow">←</span>
                </button>
                <h1>My Quizzes</h1>
            </div>
            <div class="my-quizzes-list"></div>
        `;
        
        // Add to document
        document.body.appendChild(myQuizzesScreen);
    }
    
    // Show the screen
    showScreen('my-quizzes-screen');
    
    // Populate with quizzes
    const quizzesList = myQuizzesScreen.querySelector('.my-quizzes-list');
    quizzesList.innerHTML = '';
    
    if (userQuizzes.length === 0) {
        quizzesList.innerHTML = '<div class="empty-state">You haven\'t created any quizzes yet. Go to Quiz Creation to make your first quiz!</div>';
        return;
    }
    
    userQuizzes.forEach(quiz => {
        const quizItem = document.createElement('div');
        quizItem.className = 'my-quiz-item';
        quizItem.innerHTML = `
            <div class="my-quiz-info">
                <h3>${quiz.title}</h3>
                <p>${quiz.description || 'No description'}</p>
                <div class="my-quiz-meta">
                    <span>${quiz.questions.length} Questions</span>
                    <span>Created: ${new Date(quiz.createdAt).toLocaleDateString()}</span>
                </div>
            </div>
            <div class="my-quiz-actions">
                <button class="play-button" aria-label="Start Quiz">▶</button>
            </div>
        `;
        
        // Add click event to start this quiz
        const playButton = quizItem.querySelector('.play-button');
        playButton.addEventListener('click', function() {
            startQuizWithCustomQuestions(quiz);
        });
        
        quizzesList.appendChild(quizItem);
    });
}

// Function to start a quiz with custom questions
function startQuizWithCustomQuestions(quiz) {
    console.log("Starting quiz:", quiz.title);
    console.log("Questions:", quiz.questions.length);
    console.log("Time limit:", quiz.timeLimit || 30, "minutes");
    
    // Set current quiz with time limit
    currentQuiz = {
        category: quiz.title,
        questions: quiz.questions,
        timeLimit: quiz.timeLimit || 30 // Default to 30 minutes if not specified
    };
    
    // Reset question index and answers
    currentQuestionIndex = 0;
    userAnswers = [];
    currentScore = 0;
    
    // Initialize the timer when starting a quiz
    initializeQuizTimer(currentQuiz.timeLimit);
    
    // Show quiz screen first
    showScreen('quiz-screen');
    
    // Force redraw by small timeout
    setTimeout(() => {
        try {
            // Try to get quiz content to check if it exists
            const quizContent = document.querySelector('.quiz-content');
            console.log("Quiz content found:", quizContent !== null);
            
            // Load first question
            loadQuestion();
            console.log("Loaded first question");
            
            // Start the timer
            startQuizTimer();
        } catch (error) {
            console.error("Error loading quiz:", error);
            alert("There was an error loading the quiz. Please try again.");
        }
    }, 100);
}

// Helper function to get current user email
function getCurrentUser() {
    // Try to get from localStorage first, then sessionStorage
    return localStorage.getItem('user_email') || sessionStorage.getItem('user_email') || null;
}

// Function to update user stats
function updateUserStats(statName) {
    // Get current user profile
    const userProfile = JSON.parse(localStorage.getItem('userProfile')) || {
        stats: {
            quizzes: 0,
            accuracy: '0%',
            rank: 0,
            quizzesCreated: 0
        }
    };
    
    // Update requested stat
    if (statName === 'quizzesCreated') {
        userProfile.stats.quizzesCreated = (userProfile.stats.quizzesCreated || 0) + 1;
        userProfile.stats.quizzes = userProfile.stats.quizzesCreated;
    }
    
    // Save back to localStorage
    localStorage.setItem('userProfile', JSON.stringify(userProfile));
}

// Function to initialize quiz timer
function initializeQuizTimer(timeLimit) {
    // Convert minutes to seconds
    quizTimeRemaining = (timeLimit || 30) * 60;
    
    // Clear any existing timer
    if (quizTimerInterval) {
        clearInterval(quizTimerInterval);
        quizTimerInterval = null;
    }
    
    // Create or update timer display element
    let timerElement = document.querySelector('.quiz-timer');
    if (!timerElement) {
        timerElement = document.createElement('div');
        timerElement.className = 'quiz-timer';
        
        // Add to quiz screen header
        const quizHeader = document.querySelector('#quiz-screen .header');
        if (quizHeader) {
            quizHeader.appendChild(timerElement);
        }
    }
    
    // Set initial timer display
    updateTimerDisplay();
}

// Function to start quiz timer
function startQuizTimer() {
    if (quizTimerInterval) {
        clearInterval(quizTimerInterval);
    }
    
    quizTimerInterval = setInterval(() => {
        if (quizTimeRemaining <= 0) {
            // Time's up
            clearInterval(quizTimerInterval);
            handleTimeUp();
        } else {
            quizTimeRemaining--;
            updateTimerDisplay();
        }
    }, 1000);
}

// Function to update timer display
function updateTimerDisplay() {
    const timerElement = document.querySelector('.quiz-timer');
    if (timerElement) {
        const minutes = Math.floor(quizTimeRemaining / 60);
        const seconds = quizTimeRemaining % 60;
        
        // Format time as MM:SS
        const formattedTime = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        
        // Update display
        timerElement.textContent = formattedTime;
        
        // Add warning class if time is running out (less than 1 minute)
        if (quizTimeRemaining < 60) {
            timerElement.classList.add('time-warning');
        } else {
            timerElement.classList.remove('time-warning');
        }
    }
}

// Function to pause quiz timer
function pauseQuizTimer() {
    if (quizTimerInterval) {
        clearInterval(quizTimerInterval);
        quizTimerInterval = null;
    }
}

// Function to handle time up
function handleTimeUp() {
    // Stop the timer
    pauseQuizTimer();
    
    // Show alert
    alert("Time's up! Your quiz will be submitted now.");
    
    // Submit answers and show results
    submitAnswers();
}

// Function to update user statistics
function updateUserStatistics(score, totalQuestions) {
    // Get user profile
    const userProfile = JSON.parse(localStorage.getItem('userProfile')) || {
        stats: {
            quizzes: 0,
            accuracy: '0%',
            rank: 0,
            quizzesCreated: 0,
            totalAnswered: 0,
            correctAnswers: 0
        }
    };
    
    // Update quiz count
    userProfile.stats.quizzes++;
    
    // Update total questions and correct answers
    userProfile.stats.totalAnswered = (userProfile.stats.totalAnswered || 0) + totalQuestions;
    userProfile.stats.correctAnswers = (userProfile.stats.correctAnswers || 0) + score;
    
    // Calculate and update accuracy
    if (userProfile.stats.totalAnswered > 0) {
        const accuracyPercent = Math.round((userProfile.stats.correctAnswers / userProfile.stats.totalAnswered) * 100);
        userProfile.stats.accuracy = accuracyPercent + '%';
    }
    
    // Update rank based on correct answers
    if (userProfile.stats.correctAnswers >= 500) {
        userProfile.stats.rank = 'Expert';
    } else if (userProfile.stats.correctAnswers >= 200) {
        userProfile.stats.rank = 'Advanced';
    } else if (userProfile.stats.correctAnswers >= 50) {
        userProfile.stats.rank = 'Intermediate';
    } else {
        userProfile.stats.rank = 'Beginner';
    }
    
    // Save back to localStorage
    localStorage.setItem('userProfile', JSON.stringify(userProfile));
    
    console.log('User statistics updated:', userProfile.stats);
} 