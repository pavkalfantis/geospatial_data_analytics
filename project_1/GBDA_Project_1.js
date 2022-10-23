// Question 2

// Filtered dataset for 2019 with less than 20% cloud coverage
var data19 = L8
  .filterDate('2019-01-01', '2019-12-31')
  .filterBounds(ROI)
  .filter(ee.Filter.lte('CLOUD_COVER', 20));

// define NDVI spectrum
var ndviSpectrum = {min: -0, max: 0.6, bands: 'NDVI',palette: ['red','yellow','green']}; 
// Makes colors "pop out" more; NDVI Default Spectrum Range is {min: -1, max: 1};

var trueColorSpectrum = {bands : ['B4','B3','B2'],min:5000,max:10000,};
var falseColorSpectrum = {bands : ['B5','B4','B3'],min:5000,max:10000};

// Compute NDVI
var addNDVI = function(image) {
  var ndvi = image.normalizedDifference(['B5', 'B4']).rename('NDVI');
  return image.addBands(ndvi);
};

// Compute NDWI 
var addNDWI = function(image){
  var ndwi = image.normalizedDifference(['B3', 'B5']).rename('NDWI');
  return image.addBands(ndwi);
};

// Compute EWI
var addEVI = function(image){
  var evi = image.expression('2.5 * ((NIR - RED) / (NIR + 6 * RED - 7.5 * BLUE + 1))', 
                              {'NIR' : image.select('B5'),
                               'RED' : image.select('B4'),
                               'BLUE': image.select('B2')
                              }).rename('EVI');
  return image.addBands(evi);
};

//Apply NDVI, NDWI, EVI to collection
var data19 = data19.map(addNDVI);
var data19 = data19.map(addNDWI);
var data19 = data19.map(addEVI);

//Min cloud coverage over the year
var min_cloud_image = ee.Image(data19
  .sort('ClOUD_COVER')
  .first()
  .clip(ROI)
  );


Map.centerObject(ROI,12)
Map.addLayer(min_cloud_image,trueColorSpectrum,'True Color')
Map.addLayer(min_cloud_image,falseColorSpectrum,'False Color')
Map.addLayer(min_cloud_image,ndviSpectrum,'NDVI')



// Question 3

//DOY for max ndvi
var addDOY = function(image) {
  var img_date = ee.Date(image.date());
  var img_doy = ee.Number.parse(img_date.format('D'));
  return image.addBands(ee.Image(img_doy).rename('doy').toInt());
};

var data18 = L8
  .filterDate('2018-01-01', '2018-12-31')
  .filterBounds(ROI)
  .filter(ee.Filter.lte('CLOUD_COVER', 20));
  
var l8_2019_ndvi = data19.map(addDOY); //NDVI already added
var l8_2018_ndvi = data18.map(addNDVI).map(addDOY);

var greenest_2019 = l8_2019_ndvi.qualityMosaic('NDVI').clip(ROI);
var greenest_2018 = l8_2018_ndvi.qualityMosaic('NDVI').clip(ROI);


// Display the result.
Map.addLayer(greenest_2019, ndviSpectrum, 'Greenest pixel composite 2019');
Map.addLayer(greenest_2018, ndviSpectrum, 'Greenest pixel composite 2018');

// Visualize the 'date' image
Map.addLayer(
    greenest_2019.select('doy'),
    {'palette': ['black', 'white'], 'min': 1, 'max': 365},
    'Greenest doy 2019'
)

Map.addLayer(
    greenest_2018.select('doy'),
    {'palette': ['black', 'white'], 'min': 1, 'max': 365},
    'Greenest doy 2018'
) 





//Question 4
var data = L8
  .filterBounds(TS4)
  .filter(ee.Filter.lte('CLOUD_COVER', 20))

// This field contains UNIX time in milliseconds.
var timeField = 'system:time_start';

// Use this function to add variables for NDVI, time and a constant
// to Landsat 8 imagery.
var addVariables = function(image) {
  // Compute time in fractional years since the epoch.
  var date = ee.Date(image.get(timeField));
  var years = date.difference(ee.Date('1970-01-01'), 'year');
  // Return the image with the added bands.
  return image
    // Add an NDVI band.
    .addBands(image.normalizedDifference(['B5', 'B4']).rename('NDVI')).float()
    // Add a time band.
    .addBands(ee.Image(years).rename('t').float())
    // Add a constant band.
    .addBands(ee.Image.constant(1));
};

var data = data
  .map(addVariables);

// // Plot a time series of NDVI at a single location.
// var l8Chart = ui.Chart.image.series(data.select('NDVI'), ROI)
//     .setChartType('ScatterChart')
//     .setOptions({
//       title: 'Landsat 8 NDVI time series at ROI',
//       trendlines: {0: {
//         color: 'CC0000'
//       }},
//       lineWidth: 1,
//       pointSize: 3,
//     });
// print(l8Chart);
  
// Harmonic trend ----------------------------------------------------------------
// Use these independent variables in the harmonic regression.
var harmonicIndependents = ee.List(['constant', 't', 'cos', 'sin']);

// Add harmonic terms as new image bands.
var harmonicLandsat = data.map(function(image) {
  var timeRadians = image.select('t').multiply(2 * Math.PI);
  return image
    .addBands(timeRadians.cos().rename('cos'))
    .addBands(timeRadians.sin().rename('sin'));
});
  
// Name of the dependent variable.
var dependent = ee.String('NDVI')  
  
// The output of the regression reduction is a 4x1 array image.
var harmonicTrend = harmonicLandsat
  .select(harmonicIndependents.add(dependent))
  .reduce(ee.Reducer.linearRegression(harmonicIndependents.length(), 1));

// Turn the array image into a multi-band image of coefficients.
var harmonicTrendCoefficients = harmonicTrend.select('coefficients')
  .arrayProject([0])
  .arrayFlatten([harmonicIndependents]);

// Compute fitted values.
var fittedHarmonic = harmonicLandsat.map(function(image) {
  return image.addBands(
    image.select(harmonicIndependents)
      .multiply(harmonicTrendCoefficients)
      .reduce('sum')
      .rename('fitted'));
});

// Plot the fitted model and the original data at the ROI.
print(ui.Chart.image.series(
  fittedHarmonic.select(['fitted','NDVI']), ROI, ee.Reducer.mean(), 30)
    .setSeriesNames(['NDVI', 'fitted'])
    .setOptions({
      title: 'Harmonic model: original and fitted values',
      lineWidth: 1,
      pointSize: 3,
}));
  



//Question 5
  
// CART Classification
  
var classification_collection = L8
  .filterBounds(classification_region)
  .filter(ee.Filter.lte('CLOUD_COVER', 20))
  
//Apply NDVI to collection
var classification_collection = classification_collection.map(addNDVI);
  
var classification_image = classification_collection.mean().clip(classification_region)
Map.addLayer(classification_image,trueColorSpectrum,'trueColor-classification_image');
Map.addLayer(classification_image,falseColorSpectrum,'falseColor-classification_image');
Map.addLayer(classification_image,ndviSpectrum,'ndvi-classification_image');


var label = 'Class';
var bands = ['B1','B2','B3','B4','B5','B6','B7','B8','NDVI'];


var input = classification_image.select(bands);

var training = Urban.merge(Water).merge(Vegetation).merge(Forest);

var trainImage = input.sampleRegions({
  collection: training,
  properties: [label],
  scale:30
});
  
var trainingData = trainImage.randomColumn();
var trainSet = trainingData.filter(ee.Filter.lessThan('random',0.8));
var testSet = trainingData.filter(ee.Filter.greaterThanOrEquals('random',0.8));
  
//CART

var classifier = ee.Classifier.smileCart().train(trainSet,label,bands);
var classifier_svm = ee.Classifier.libsvm().train(trainSet,label,bands);

var classified = input.classify(classifier);
var classified_svm = input.classify(classifier_svm);

var landcoverPalette = [
  '#5DADE2', //water
  '#C0392B', //urban
  '#ABEBC6', //vegetation
  '#117A65', //forest
];

Map.addLayer(classified, {palette:landcoverPalette, min:0, max:3},'classification_cart');
Map.addLayer(classified_svm, {palette:landcoverPalette, min:0, max:3},'classification_svm');

var confusionMatrix = ee.ConfusionMatrix(testSet.classify(classifier)
  .errorMatrix({
    actual: 'Class',
    predicted: 'classification'
  }));
var confusionMatrix_svm = ee.ConfusionMatrix(testSet.classify(classifier_svm)
  .errorMatrix({
    actual: 'Class',
    predicted: 'classification'
  }));
  
  
print(confusionMatrix)
print(confusionMatrix.accuracy())


print(confusionMatrix_svm)
print(confusionMatrix_svm.accuracy())