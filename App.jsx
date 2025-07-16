import React from 'react';
import { Routes, Route } from 'react-router-dom';
import FormPage   from './FormPage';
import StatusPage from './StatusPage';

export default function App() {
	return (
    	<Routes>
      	<Route path="/"       element={<FormPage />}   />
      	<Route path="/status" element={<StatusPage />} />
    	</Routes>
  	);
}