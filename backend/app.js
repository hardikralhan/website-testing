const express = require('express');
const cors = require('cors');
const accessibilityTestRoutes = require('./routes/accessibility_test');
const UITestRoutes = require('./routes/ui_test');
const SEOTestRoutes = require('./routes/seo_test');
const performanceTestRoutes = require('./routes/performance'); // Adjust path as necessary

const app = express();
app.use(cors());
app.use(express.json());
app.use('/api/', accessibilityTestRoutes);
app.use('/api/ui/', UITestRoutes);
app.use('/api/seo/', SEOTestRoutes);
app.use('/api/performance', performanceTestRoutes);

app.listen(8888, () => {
    console.log('Server running on port 8888');
});