const express = require('express');
const cors = require('cors');
const accessibilityTestRoutes = require('./routes/accessibility_test');
const UITestRoutes = require('./routes/ui_test');
const SEOTestRoutes = require('./routes/seo_test');
const performanceTestRoutes = require('./routes/performance'); // Adjust path as necessary
const mobileResponsiveRoutes = require('./routes/mobile_responsive'); // Adjust path as necessary
const grammaticalTestRoutes = require('./routes/grammatical_test'); // Adjust path as necessary
const pdfReportRoutes = require('./routes/pdf_report');
const UISSTestRoutes = require('./routes/ui_with_ss_test');
require('dotenv').config();
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());
app.use('/api/', accessibilityTestRoutes);
app.use('/api/ui/', UITestRoutes);
app.use('/api/seo/', SEOTestRoutes);
app.use('/api/performance', performanceTestRoutes);
app.use('/api/mobile', mobileResponsiveRoutes); // Adjust path as necessary
app.use('/api/', grammaticalTestRoutes); // Adjust path as necessary
app.use('/api/', pdfReportRoutes);
app.use('/api/ui/', UISSTestRoutes);

app.use('/snippets', express.static(path.join(__dirname, 'public', 'snippets')));

app.listen(8888, () => {
    console.log('Server running on port 8888');
});