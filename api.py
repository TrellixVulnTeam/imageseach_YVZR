# using flask_restful
import numpy as np
from flask import Flask, jsonify, request
from flask_restful import Resource, Api
from flask_cors import CORS

app = Flask(__name__)
cors = CORS(app, resources={r"*": {"origins": "*"}})
api = Api(app)

class ImageApi(Resource):

    def post(self):

        try:
            # This variable stores base64 data send from the request
            base_64_data = request.get_json()['image_64']
            image_array = np.asarray(base_64_data)
            image_array = image_array.flatten()
        except Exception as e:
            return jsonify({'response': False})
        return jsonify({'base64_img': base_64_data})


api.add_resource(ImageApi, '/image_api')


# driver function
if __name__ == '__main__':
    app.run(debug=True)
