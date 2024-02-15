import axios from 'axios';
import Box from '@mui/material/Box';
import TextField from '@mui/material/TextField';
import Button from '@mui/material/Button';
import FormControl from '@mui/material/FormControl';
import Grid from '@mui/material/Grid';
import Checkbox from '@mui/material/Checkbox';
import FormControlLabel from '@mui/material/FormControlLabel';
import TextareaAutosize from '@mui/material/TextareaAutosize';
import Select from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import InputLabel from '@mui/material/InputLabel';
import Container from '@mui/material/Container';
import Typography from '@mui/material/Typography';
import AWS from 'aws-sdk';
import { useState , useEffect } from 'react';
import { openDB } from 'idb'; 



const minioEndpoint = 'http://10.8.0.13:9000';
const accessKey = 'minioadmin';
const secretKey = 'minioadmin';
const bucketName = 'test';

AWS.config.update({
  accessKeyId: accessKey,
  secretAccessKey: secretKey,
  endpoint: minioEndpoint,
  s3ForcePathStyle: true,
  signatureVersion: 'v4',
});

const s3 = new AWS.S3();

const minioUploader = async (file, fileName) => {
  const params = {
    Bucket: bucketName,
    Key: fileName,
    Body: file,
    ContentType: file.type,
  };

  try {
    await s3.upload(params).promise();
  } catch (error) {
    console.error('Error uploading to MinIO:', error);
    throw error;
  }
};


const dbPromise = openDB('medicalFormDB', 1, {
  upgrade(db) {
    db.createObjectStore('medicalForms', { keyPath: '_id', autoIncrement: true });
    
  },
});





const diseases = ['Diabetes', 'Heart disease', 'Asthma', 'Cancer'];

const Form1 = () => {
  const [medicalFormData, setMedicalFormData] = useState({});
  const [file, setFile] = useState(null);
  const [offlineStorageEnabled, setOfflineStorageEnabled] = useState(false);
  const [lastSyncTimestamp, setLastSyncTimestamp] = useState(null);
  const [timestamp, setTimestamp] = useState(null);
  const [successMessage, setSuccessMessage] = useState('');
  useEffect(() => {
    // Check if the navigator is online
    setOfflineStorageEnabled(!navigator.onLine);

    // Add event listeners to track online/offline status changes
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Cleanup event listeners on component unmount
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);
  const handleOnline = async () => {
    setOfflineStorageEnabled(false);
  
    // Retrieve the last sync timestamp from your storage
    const lastSyncTimestamp = localStorage.getItem('lastSyncTimestamp');
    console.log(lastSyncTimestamp);
  
    var request = indexedDB.open('medicalFormDB', 1);
  
    request.onsuccess = function (event) {
      var db = event.target.result;
  
      var transaction = db.transaction(['medicalForms'], 'readonly');
      var objectStore = transaction.objectStore('medicalForms');
  
      var cursorRequest = objectStore.openCursor();
  
      // Initialize maxTimestamp with a very small value
      let maxTimestamp = new Date(0);
      let recordsToSync = [];
  
      cursorRequest.onsuccess = function (event) {
        var cursor = event.target.result;
  
        if (cursor) {
          let recordTimestamp;
          // console.log('Processing record:', cursor.value);
  
          if (cursor.value.data && cursor.value.data.timestamp) {
            recordTimestamp = cursor.value.data.timestamp;
            // console.log('1',recordTimestamp)
          } else if (cursor.value.timestamp) {
            recordTimestamp = cursor.value.timestamp;
            // console.log('2',recordTimestamp)
          }
  
          if (recordTimestamp) {
            const date = new Date(recordTimestamp);
            maxTimestamp = date > maxTimestamp ? date : maxTimestamp;
          }
            // console.log(maxTimestamp)
          
          // console.log(cursor.value.data)
          // console.log(cursor.value.file)
          if(recordTimestamp>new Date(lastSyncTimestamp)){
           
          recordsToSync.push({
            data: cursor.value.data || cursor.value,
            file: cursor.value.file,
            _id: cursor.value._id
          });

          console.log('rtc',recordsToSync)
        }
  
          cursor.continue();
        } else {
          console.log('Cursor reached the end');
          // ... rest of the code
          // Cursor has reached the end
          console.log(maxTimestamp)
          console.log(new Date(lastSyncTimestamp))
          if (maxTimestamp > new Date(lastSyncTimestamp)) {
            console.log('true')
            if (recordsToSync.length > 0) {
              console.log('true')
              // Call your syncDataToMongoDB function here with the array of records
              syncDataToMongoDB(recordsToSync);
  
              // Update the last sync timestamp in your storage
              const newLastSyncTimestamp = new Date();
              localStorage.setItem('lastSyncTimestamp', newLastSyncTimestamp.toISOString());
            } else {
              console.log('No new records since the last sync');
            }
          }
        }
      };
  
      cursorRequest.onerror = function (event) {
        console.error("Error in cursorRequest:", event.target.error);
      };
    };
  
    request.onerror = function (event) {
      console.error("Error in request:", event.target.error);
    };
  };

  



  const syncDataToMongoDB = async (recordsToSync) => {
    console.log('inside')
    try {
      // Map the array of records to an array of axios requests
      const requests = recordsToSync.map(async ({ data, file, _id }) => {
        try {
          // Check if data with the given _id exists
          const existingFormData = await axios.get(`http://localhost:5000/medicalForm/${_id}`);
  
          // If the GET request is successful, the medical form exists, and you can skip data synchronization
          console.log(`Data with _id ${_id} already exists. Skipping data sync.`);
  
          let fileUrl = '';
  
          if (file) {
            // Upload new file and get the file URL
            const fileName = `medical_form_${Date.now()}_${file.name}`;
            await minioUploader(file, fileName);
            fileUrl = `${minioEndpoint}/${bucketName}/${fileName}`;
          }
  
          // Update existing data
          const syncResponse = await axios.put(`http://localhost:5000//updateMedicalData/${existingFormData.data._id}`, {
            ...data,
            id: _id,
            fileUrl,
            updatedAt: new Date(),
          });
  
          console.log('Data updated in MongoDB:', syncResponse.data);
        } catch (error) {
          console.log('catch')
          // If the GET request fails with a 404 error, proceed to sync the data
          if (error.response && error.response.status === 404) {
            let fileUrl = '';
  
            if (file) {
              // Upload new file and get the file URL
              const fileName = `medical_form_${Date.now()}_${file.name}`;
              await minioUploader(file, fileName);
              fileUrl = `${minioEndpoint}/${bucketName}/${fileName}`;
            }
  
            // Create new entry
            const syncResponse = await axios.post('http://localhost:5000/medicalForm', {
              ...data,
              id: _id,
              fileUrl,
              // createdAt: new Date(),
            });
  
            console.log('Data synced to MongoDB:', syncResponse.data);
          } else {
            // Handle other errors (not 404) as needed
            throw error;
          }
        }
      });
  
      // Execute all requests in parallel
      await Promise.all(requests);
    } catch (error) {
      console.error('Error syncing data to MongoDB:', error);
    }
  };
  
  
  
  
  // Example: Usage of the functions
  // Assuming this is triggered when going online
 
  
      // Check if the medical form with the given id exists
  //     const existingFormData = await axios.get(`http://localhost:5000/medicalForm/${id}`);
      
  
  //     if (existingFormData) {
  //       // If the GET request is successful, the medical form exists,
  //       // and you can update the existing data
  //       console.log(`Data with id ${existingFormData._id} already exists. Updating data.`);
  
  //       let fileUrl = '';
  //       if (file) {
  //         // Upload new file and get the file URL
  //         const fileName = `medical_form_${Date.now()}_${file.name}`;
  //         await minioUploader(file, fileName);
  //         fileUrl = `${minioEndpoint}/${bucketName}/${fileName}`;
  //       }
  
  //       // Update existing data
  //       const syncResponse = await axios.put(`http://localhost:5000/medicalForm/${existingFormData._id}`, {
  //         ...formData,
  //         id: id,
  //         fileUrl,
  //       });
  
  //       console.log('Data updated in MongoDB:', syncResponse.data);
  //     } else {
  //       // If the GET request is unsuccessful, the medical form does not exist,
  //       // and you can create a new entry
  //       console.log(`Data with id ${id} does not exist. Creating new data.`);
  
  //       let fileUrl = '';
  //       if (file) {
  //         // Upload new file and get the file URL
  //         const fileName = `medical_form_${Date.now()}_${file.name}`;
  //         await minioUploader(file, fileName);
  //         fileUrl = `${minioEndpoint}/${bucketName}/${fileName}`;
  //       }
  
  //       // Create new entry
  //       const syncResponse = await axios.post('http://localhost:5000/medicalForm', {
  //         ...formData,
  //         id: id,
  //         fileUrl,
  //       });
  
  //       console.log('Data synced to MongoDB:', syncResponse.data);
  //     }
  //   } catch (error) {
  //     console.log('Error:', error);
  //   }
  // };
  // }  

  
    // You can trigger the submission of offline data to the server here
    
        // Check for the last sync timestamp in MongoDB
      
    
       
    
        // Check for the last sync timestamp in IndexedDB
       
        

  const handleOffline = () => {
    setOfflineStorageEnabled(true);
  };
  
 
  
  const handleChange = (event) => {
    const { name, value } = event.target;
  
    let updatedMedicalFormData;
  
    if (name === 'height' || name === 'weight') {
      const updatedHeight = name === 'height' ? parseFloat(value) : parseFloat(medicalFormData.height) || 0;
      const updatedWeight = name === 'weight' ? parseFloat(value) : parseFloat(medicalFormData.weight) || 0;
      const bmi = updatedWeight / ((updatedHeight / 100) ** 2);
  
      updatedMedicalFormData = {
        ...medicalFormData,
        [name]: value,
        height: updatedHeight,
        weight: updatedWeight,
        bmi: isNaN(bmi) ? '' : bmi.toFixed(2),
      };
    } 
    else if (name === 'phoneNumber') {
      // Remove non-numeric characters
      const numericValue = value.replace(/\D/g, '');
    
      // Ensure it has at most 10 digits
      const validPhoneNumber = /^\d{0,10}$/.test(numericValue);
    
      if (validPhoneNumber) {
        updatedMedicalFormData = {
          ...medicalFormData,
          [name]: numericValue,
        };
      } else {
        // Handle invalid phone number input (e.g., display an error message)
        console.error('Invalid phone number input');
        return;
      }
    }
    else if (name === 'firstName' || name === 'lastName') {
      
      const alphabeticValue = value.replace(/[^A-Za-z]/g, ''); 
      updatedMedicalFormData = {
        ...medicalFormData,
        [name]: alphabeticValue,
      };
    }
    else if (name === 'disease') {
      const updatedDiseases = Array.isArray(value) ? value : medicalFormData.disease || [];
  
      updatedMedicalFormData = {
        ...medicalFormData,
        disease: updatedDiseases,
      };
    }
    else {
      updatedMedicalFormData = {
        ...medicalFormData,
        [name]: value,
      };
    }
  
    setMedicalFormData(updatedMedicalFormData);
  };
  

  const handleFileChange = (event) => {
    const selectedFile = event.target.files[0];
    setFile(selectedFile);
  };

 

  const handleSubmit = async (event) => {
    event.preventDefault();
  
    try {
      const timestamp = new Date().getTime();
  
      // Store data in IndexedDB
      const db = await dbPromise;
      const indexedDbData = { data: { ...medicalFormData, timestamp }, file };
      const indexedDbResponse = await db.add('medicalForms', indexedDbData);
      console.log('Data saved to IndexedDB:', indexedDbResponse);
  
      setSuccessMessage('Form submitted successfully (offline)');
  
      if (navigator.onLine) {
        const fileName = `medical_form_${timestamp}_${file.name}`;
        await minioUploader(file, fileName);
  
        // Send data to MongoDB with 'id' instead of '_id'
        const response = await axios.post('http://localhost:5000/medicalForm', {
          ...medicalFormData,
          id: indexedDbResponse,
          fileUrl: `${minioEndpoint}/${bucketName}/${fileName}`,
        });
  
        console.log('Response from MongoDB:', response.data);
  
        setMedicalFormData({});
        setFile(null);
      } else {
        console.error('No file selected.');
      }
    } catch (error) {
      console.error('Error:', error);
      setSuccessMessage('Form submission failed');
    }
  };
  
  
  


  return (
    <Container component="main" maxWidth="md">
    <Typography variant="h3" align="center" gutterBottom>
      Basic Medical Form
    </Typography>

    <form onSubmit={handleSubmit}>
      <Grid container spacing={2}>
        <Grid item xs={12} sm={6}>
          <TextField
            fullWidth
            variant="outlined"
            margin="normal"
            required
            id="firstName"
            label="First Name"
            name="firstName"
            value={medicalFormData.firstName || ''}
            onChange={handleChange}
          />
        </Grid>

        <Grid item xs={12} sm={6}>
          <TextField
            fullWidth
            variant="outlined"
            margin="normal"
            required
            id="lastName"
            label="Last Name"
            name="lastName"
            value={medicalFormData.lastName || ''}
            onChange={handleChange}
          />
        </Grid>

        <Grid item xs={12} sm={6}>
          <TextField
            fullWidth
            variant="outlined"
            margin="normal"
            required
            id="phoneNumber"
            label="Phone Number"
            name="phoneNumber"
            type="tel"
            value={medicalFormData.phoneNumber || ''}
            onChange={handleChange}
          />
        </Grid>
        <Grid item xs={12} sm={6}>
  <TextField
    fullWidth
    variant="outlined"
    margin="normal"
    required
    id="email"
    label="Email Address"
    name="email"
    type="email"  
    value={medicalFormData.email || ''}
    onChange={handleChange}
  />
</Grid>
<Grid item xs={12} sm={6}>
            <TextField
              fullWidth
              variant="outlined"
              margin="normal"
              required
              id="dob"
              label="Date of Birth"
              name="dob"
              type="date"
              InputLabelProps={{
                shrink: true,
              }}
              value={medicalFormData.dob || ''}
              onChange={handleChange}
            />
          </Grid>

        <Grid item xs={12} sm={6}>
          <FormControl fullWidth margin="normal">
            <InputLabel htmlFor="gender">Gender</InputLabel>
            <Select
              label="Gender"
              name="gender"
              value={medicalFormData.gender || ''}
              onChange={handleChange}
            >
              <MenuItem value="male">Male</MenuItem>
              <MenuItem value="female">Female</MenuItem>
            </Select>
          </FormControl>
        </Grid>

        <Grid item xs={12}>
            <FormControl fullWidth margin="normal">
              <InputLabel htmlFor="disease">Disease</InputLabel>
              <Select
                label="Disease"
                name="disease"
                multiple
                value={medicalFormData.disease || []}
                onChange={handleChange}
              >
                {diseases.map((disease) => (
                  <MenuItem key={disease} value={disease}>
                    {disease}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>

        

        <Grid item xs={12} sm={6}>
          <TextField
            fullWidth
            variant="outlined"
            margin="normal"
            required
            id="height"
            label="Height (cm)"
            name="height"
            type="number"
            value={medicalFormData.height || ''}
            onChange={handleChange}
          />
        </Grid>

        <Grid item xs={12} sm={6}>
          <TextField
            fullWidth
            variant="outlined"
            margin="normal"
            required
            id="weight"
            label="Weight (kg)"
            name="weight"
            type="number"
            value={medicalFormData.weight || ''}
            onChange={handleChange}
          />
        </Grid>

        <Grid item xs={12} sm={6}>
          <TextField
            fullWidth
            variant="outlined"
            margin="normal"
            required
            id="bmi"
            label="BMI"
            name="bmi"
            type="number"
            size="small"
            value={medicalFormData.bmi || ''}
            onChange={handleChange}
            InputProps={{
              readOnly: true,
            }}
          />
        </Grid>

        <Grid item xs={12} sm={6}>
          <input type="file" name="file" onChange={handleFileChange} />
        </Grid> 

        <Grid item xs={12}>
          <Button
            type="submit"
            variant="contained"
            color="primary"
            fullWidth
          >
            Submit
          </Button>
          
        </Grid>
      </Grid>
    </form>
  </Container>
  );
};


export default Form1;
