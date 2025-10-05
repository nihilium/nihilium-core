import React, { useState } from 'react';
import {
  Box,
  Button,
  Paper,
  Typography,
  Container,
  Stack,
  Alert,
  Snackbar
} from '@mui/material';
import { CloudUpload, Download, Settings, CheckCircle } from '@mui/icons-material';
import { getDefaultSealingProcess, getDefaultUnsealingProcess, nhsdk} from '@nihilium/client-sdk';

const App: React.FC = () => {
  const [files, setFiles] = useState<File[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const [snackbarOpen, setSnackbarOpen] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState('');

  const handleButton1Click = async () => {
    var success = 0;
    var failed = 0;
    while(true) {
      var testing = nhsdk.cryptoTools.generateRandom248BitNumber()
      const clientSealingProcess = await getDefaultSealingProcess()
      await clientSealingProcess.initialize(testing, testing)
      var res = await clientSealingProcess.request_commitment_to_processor()
      console.log(res)
      var unsealingProcess = await getDefaultUnsealingProcess(res)
      await unsealingProcess.initialize()
      var unsealingResult = await unsealingProcess.publish_reveal_value()
      var counter = 0
      while(true) {
        var provable = await unsealingProcess.validate_elligble_for_unsealing();
        await new Promise(resolve => setTimeout(resolve, 500));
        counter++;
        if(counter % 50){
          console.log("Counter: " + counter);
        }
        if(provable) {
          break;
        }
        
      }
      const unseal_response = await unsealingProcess.unseal_request_to_processor();
      //await validatedSigHeAddCircuit.init()
      // var testtesta = await validatedSigHeAddCircuit.verifyProof(unseal_request.proof)
      // var testtest = await o.verify(unseal_request.proof.proof, unseal_request.proof.publicInputs);
      //const unseal_response = await processor.process_unseal_request(unseal_request);
      const unsealed_value = await unsealingProcess.process_unseal_response(unseal_response);
      console.log("Unsealed value: " + unsealed_value)
      console.log("Unsealed value: " + testing)
      if(unsealed_value == testing) {
        success++;
      }else{
        failed++;
      }
      setSnackbarMessage(`Success: ${success} Failed: ${failed}`);
      console.log("Success: " + success + " Failed: " + failed);
      setSnackbarOpen(true);
    }
    
    setSnackbarOpen(true);
  };

  const handleButton2Click = () => {
    setSnackbarMessage('Button 2 clicked!');
    setSnackbarOpen(true);
  };

  const handleButton3Click = () => {
    setSnackbarMessage('Button 3 clicked!');
    setSnackbarOpen(true);
  };

  const handleFileDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
    const droppedFiles = Array.from(e.dataTransfer.files);
    setFiles(prev => [...prev, ...droppedFiles]);
    setSnackbarMessage(`${droppedFiles.length} file(s) dropped!`);
    setSnackbarOpen(true);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = e.target.files ? Array.from(e.target.files) : [];
    setFiles(prev => [...prev, ...selectedFiles]);
    setSnackbarMessage(`${selectedFiles.length} file(s) selected!`);
    setSnackbarOpen(true);
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const handleSnackbarClose = () => {
    setSnackbarOpen(false);
  };

  return (
    <Container maxWidth="md" sx={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <Paper 
        elevation={3} 
        sx={{ 
          p: 4, 
          width: '100%', 
          maxWidth: 600,
          textAlign: 'center'
        }}
      >
        <Typography variant="h4" component="h1" gutterBottom>
          Test UI
        </Typography>
        <Typography variant="body1" color="text.secondary" sx={{ mb: 4 }}>
          A simple one-page React app with Material-UI components
        </Typography>
        <Stack direction="row" spacing={2} justifyContent="center" sx={{ mb: 4 }}>
          <Button
            variant="contained"
            startIcon={<CloudUpload />}
            onClick={handleButton1Click}
            sx={{ minWidth: 120 }}
          >
            Upload
          </Button>
          <Button
            variant="outlined"
            startIcon={<Download />}
            onClick={handleButton2Click}
            sx={{ minWidth: 120 }}
          >
            Download
          </Button>
          <Button
            variant="contained"
            color="secondary"
            startIcon={<Settings />}
            onClick={handleButton3Click}
            sx={{ minWidth: 120 }}
          >
            Settings
          </Button>
        </Stack>
        <Paper
          variant="outlined"
          sx={{
            p: 3,
            border: isDragOver ? '2px dashed #1976d2' : '2px dashed #ccc',
            backgroundColor: isDragOver ? 'rgba(25, 118, 210, 0.08)' : 'transparent',
            transition: 'all 0.2s ease-in-out',
            cursor: 'pointer',
            position: 'relative'
          }}
          onDrop={handleFileDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
        >
          <input
            type="file"
            multiple
            onChange={handleFileSelect}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              opacity: 0,
              cursor: 'pointer'
            }}
          />
          <Box sx={{ pointerEvents: 'none' }}>
            <CloudUpload sx={{ fontSize: 48, color: 'text.secondary', mb: 2 }} />
            <Typography variant="h6" gutterBottom>
              Drop files here or click to select
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Supports multiple file selection
            </Typography>
          </Box>
        </Paper>
        {files.length > 0 && (
          <Box sx={{ mt: 3, textAlign: 'left' }}>
            <Typography variant="h6" gutterBottom>
              Selected Files ({files.length}):
            </Typography>
            <Stack spacing={1}>
              {files.map((file, index) => (
                <Box key={index} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <CheckCircle color="success" sx={{ fontSize: 16 }} />
                  <Typography variant="body2">
                    {file.name} ({(file.size / 1024).toFixed(1)} KB)
                  </Typography>
                </Box>
              ))}
            </Stack>
          </Box>
        )}
      </Paper>
      <Snackbar
        open={snackbarOpen}
        autoHideDuration={3000}
        onClose={handleSnackbarClose}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert onClose={handleSnackbarClose} severity="success" sx={{ width: '100%' }}>
          {snackbarMessage}
        </Alert>
      </Snackbar>
    </Container>
  );
};

export default App;
