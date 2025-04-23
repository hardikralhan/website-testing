const OpenAI = require('openai');

// Initialize OpenAI client with your API key
const openai = new OpenAI();

// Function to fetch remediation steps from OpenAI
async function getRemediationFromOpenAI(id, description) {
    try {
        const response = await openai.chat.completions.create({
            model: 'gpt-4o-mini', // You can use another model if preferred
            response_format: { type: 'json_object' }, // Ensures JSON output
            messages: [
                {
                    role: 'system',
                    content: 'You are an accessibility expert specializing in WCAG compliance. Provide detailed remediation for the given accessibility violation in JSON format with a "remediation" key.'
                },
                {
                    role: 'user',
                    content: `Violation ID: ${id}\nDescription: ${description}\nPlease provide remediation for WCAG compliance. it should be single line in detail specifying what WCAG specify and in JSON format with a "remediation" key.`
                }
            ]
        });
        const remediation = JSON.parse(response.choices[0].message.content).remediation;
        return remediation;
    } catch (error) {
        console.error('Error fetching remediation from OpenAI:', error);
        return 'Unable to fetch remediation steps due to an error.';
    }
}

module.exports = {
    getRemediationFromOpenAI
};