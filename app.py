from flask import Flask, request, jsonify
from flask_pymongo import PyMongo
from flask_cors import CORS
from datetime import datetime
from bson.objectid import ObjectId
from bson.errors import InvalidId
from bson.json_util import dumps, loads
from pymongo import MongoClient


app = Flask(__name__)
CORS(app)

LOGSTASH_ENDPOINT = 'http://localhost:9600'
# Configure MongoDB
app.config['MONGO_URI'] = 'mongodb://localhost:27017/your_database_name'
mongo = PyMongo(app)


client = MongoClient('mongodb://localhost:27017/')
db = client['your_database_name']
collection = db['medical_forms']


@app.route('/submit', methods=['POST'])
def submit():
    message = request.form['message']
    
    # Send message to Logstash
    logstash_payload = {'message': message}
    response = requests.post(LOGSTASH_ENDPOINT, json=logstash_payload)
    
    if response.status_code == 200:
        return 'Message submitted successfully!'
    else:
        return 'Error submitting message to Logstash'
@app.route('/medicalForm', methods=['POST'])
def save_medical_form():
    try:
        medical_data = request.json

        # Validate the data here (ensure required fields are present, etc.)

        # Add timestamp to the data
        if 'createdAt' in medical_data and 'timestamp' in medical_data:
            return jsonify({"error": "Both 'createdAt' and 'timestamp' cannot be provided"}), 400

        # If 'timestamp' is provided, use it; otherwise, use current time as 'createdAt'
        timestamp = medical_data.get('timestamp', None)
        if timestamp is not None:
            medical_data['createdAt'] = datetime.utcfromtimestamp(timestamp / 1000.0)
        else:
            medical_data['createdAt'] = datetime.utcnow()
        # Store the data in MongoDB
        mongo.db.medical_forms.insert_one(medical_data)

        return jsonify({"message": "Medical form data saved successfully"})
    except Exception as e:
        app.logger.error(f"Error saving medical form data: {str(e)}")
        return jsonify({"error": str(e)}), 500
    
@app.route('/medicalForm/<id>', methods=['PUT'])
def update_medical_form(id):
    try:
        # Assuming you have a MongoDB collection named 'medical_forms'
        medical_forms = mongo.db.medical_forms
        print("Received ID:", id)

        # Convert the provided ID to ObjectId
        existing_data = medical_forms.find_one({'_id': ObjectId(id)})
        # existing_data = medical_forms.find_one({'id': int(id)})

        print("Existing Data:", existing_data)

        if not existing_data:
            return jsonify({'message': f'Data with id {id} not found'}), 404

        # Get the updated data from the request body, excluding '_id'
        updated_data = request.get_json()
        print(updated_data)

        # del updated_data['_id']  # Remove the '_id' field from the update data

        # # Update the existing data with the new data
        medical_forms.update_one({'_id': ObjectId(id)}, {'$set': updated_data})

        return jsonify({'message': f'Data with id {id} updated successfully'})
    except Exception as e:
        print("Error:", str(e))
        return jsonify({'message': 'Internal server error'}), 500
    


@app.route('/getMedicalData', methods=['GET'])
def get_medical_data():
    try:
        medical_data = list(mongo.db.medical_forms.find())  # Retrieve all medical records

        # Convert ObjectId to string in the response using dumps
        serialized_data = dumps(medical_data)

        return serialized_data
    except InvalidId:
        return jsonify({"error": "Invalid ObjectId"}), 400
    except Exception as e:
        return jsonify({"error": str(e)}), 500
@app.route('/getMedicalData/<string:id>', methods=['GET'])
def get_medical_data_by_id(id):
    try:
        # Attempt to convert the string id to a valid ObjectId
        try:
            obj_id = ObjectId(id)
        except InvalidId:
            obj_id = None

        # Try to find medical data using ObjectId
        medical_data = mongo.db.medical_forms.find_one({'_id': obj_id})

        if medical_data:
            # Convert ObjectId to string in the response using dumps
            serialized_data = dumps(medical_data)
            return serialized_data
        else:
            # If not found, try to find medical data using int(id)
            medical_data_int = mongo.db.medical_forms.find_one({'_id': int(id)})

            if medical_data_int:
                serialized_data_int = dumps(medical_data_int)
                return serialized_data_int
            else:
                return jsonify({"message": "Medical record not found"}), 404

    except InvalidId:
        return jsonify({"error": "Invalid ObjectId"}), 400
    except Exception as e:
        return jsonify({"error": str(e)}), 500

    

@app.route('/deleteAllMedicalData', methods=['DELETE'])
def delete_all_medical_data():
    # Delete all data from MongoDB
    result = collection.delete_many({})
    return jsonify({'deleted_count': result.deleted_count})


@app.route('/deleteMedicalData/<string:id>', methods=['DELETE'])
def delete_medical_data(id):
    try:
        # Use ObjectId to convert the string id to a valid ObjectId
        try:
            obj_id = ObjectId(id)
        except InvalidId:
            obj_id = None

        # Try to delete medical data using ObjectId
        result = mongo.db.medical_forms.delete_one({'_id': obj_id})

        if result.deleted_count > 0:
            return jsonify({"message": "Medical record deleted successfully"})

        # If not found using ObjectId, try deleting using int(id)
        result_int = mongo.db.medical_forms.delete_one({'_id': int(id)})

        if result_int.deleted_count > 0:
            return jsonify({"message": "Medical record deleted successfully"})
        else:
            return jsonify({"message": "Medical record not found"}), 404

    except BadRequest as e:
        return jsonify({"error": str(e)}), 400
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    
@app.route('/syncData/<string:existing_data_id>', methods=['PUT', 'PATCH'])
def sync_data(existing_data_id):
    try:
        data = request.get_json()
        print(data)

        # Assuming 'fileUrl' is part of the data
       # file_url = data.get('fileUrl', '')

        # Update the existing data in MongoDB
        mongo.db.medical_forms.update_one(
            {'_id': ObjectId(existing_data_id)},
            {'$set': {data}},
        )
        
        return jsonify({'message': 'Data synced successfully'}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 5001


@app.route('/updateMedicalData/<string:id>', methods=['PUT', 'PATCH'])
def update_medical_data(id):
    try:
        # Ensure that the request has a JSON payload
        if not request.is_json:
            raise BadRequest("Invalid request format. JSON expected.")

        # Get the updated data from the JSON payload
        updated_data = request.json

        # Validate the updated data here if needed

        # Use ObjectId to convert the string id to a valid ObjectId
        try:
            obj_id = ObjectId(id)
        except InvalidId:
            obj_id = None

        # Try to update medical data using ObjectId
        result = mongo.db.medical_forms.update_one({'_id': obj_id}, {'$set': updated_data})

        if result.matched_count > 0:
            return jsonify({"message": "Medical record updated successfully"})
        
        # If not found using ObjectId, try updating using int(id)
        result_int = mongo.db.medical_forms.update_one({'_id': int(id)}, {'$set': updated_data})

        if result_int.matched_count > 0:
            return jsonify({"message": "Medical record updated successfully"})
        else:
            return jsonify({"message": "Medical record not found"}), 404

    except BadRequest as e:
        return jsonify({"error": str(e)}), 400
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    
@app.route('/get_last_created_at', methods=['GET'])
def get_last_created_at():
    try:
        # Find the document with the latest createdAt value
        latest_document = mongo.db.medical_forms.find_one(sort=[('createdAt', -1)], projection={'createdAt': 1})
        
        # Check if there is a document
        if latest_document:
            timestamp = latest_document['createdAt']
            return jsonify({'lastSyncTimestamp': timestamp})
        else:
            timestamp = 0
            utc_formatted_timestamp = datetime.utcfromtimestamp(timestamp / 1000.0).strftime('%a, %d %b %Y %H:%M:%S GMT')
            return jsonify({'lastSyncTimestamp': utc_formatted_timestamp})
    except Exception as e:
        return jsonify({'error': str(e)})
    


@app.route('/get_last_timestamp', methods=['GET'])
def get_last_timestamp():
    try:
        # Find the document with the latest createdAt value
        latest_document = mongo.db.medical_forms.find_one(sort=[('timestamp', -1)], projection={'timestamp': 1})
        
        # Check if there is a document
        if latest_document:
            timestamp = latest_document['timestamp']
            return jsonify({'lastSyncTimestamp': timestamp})
        else:
            timestamp = 0
            utc_formatted_timestamp = datetime.utcfromtimestamp(timestamp / 1000.0).strftime('%a, %d %b %Y %H:%M:%S GMT')
            return jsonify({'lastSyncTimestamp': utc_formatted_timestamp})
    except Exception as e:
        return jsonify({'error': str(e)})

    

@app.route('/check_collection_empty', methods=['GET'])
def check_collection_empty():
    count = collection.count_documents({})

    if count == 0:
        result = {"message": "0"}
    else:
        result = {"message": f"The collection 'medical_forms' is not empty. It has {count} document(s)."}

    return jsonify(result)


# @app.route('/medicalForm/<id>', methods=['GET'])
# def get_medical_form(id):
#     try:
#         print("Received ID:", id)
#         medical_form = mongo.db.medical_forms.find_one({'id': id})
        
#         print("MongoDB Document:", medical_form)

#         if not medical_form:
#             return jsonify({'message': 'Medical form not found'}), 404

#         medical_form['_id'] = str(medical_form['_id'])
#         return jsonify(medical_form)
#     except Exception as e:
#         print("Error:", str(e))
#         return jsonify({'message': 'Internal server error'}), 500



    
@app.route('/medicalForm/<id>', methods=['GET'])
def get_medical_form(id):
    try:
        # medical_form = mongo.db.medical_forms.find_one({'id': id})
        medical_form = mongo.db.medical_forms.find_one({'id': int(id)})

        print(medical_form)



        if not medical_form:
            
            # form_data = request.args.to_dict()
            # syncDataToMongoDB(form_data)

            return jsonify({'message': 'Medical form not found'}), 404
        
        medical_form['_id'] = str(medical_form['_id'])


        return jsonify(medical_form)
    except Exception as e:
        print('Error fetching medical form:', str(e))
        return jsonify({'message': 'Internal Server Error'}), 500
    

@app.route('/searchMedicalData', methods=['GET'])
def search_medical_data():
    try:
        # Get the disease parameter from the query string
        disease = request.args.get('disease', None)

        if not disease:
            return jsonify({"error": "Disease parameter is required"}), 400

        # Create a query to find medical records based on the disease
        query = {'disease': {'$regex': disease, '$options': 'i'}}

        medical_records = mongo.db.medical_forms.find(query)

        # Convert ObjectId to string in the response using dumps
        serialized_data = dumps(medical_records)

        return serialized_data

    except Exception as e:
        return jsonify({"error": str(e)}), 500

    

if __name__ == '__main__':
    app.run(debug=True)