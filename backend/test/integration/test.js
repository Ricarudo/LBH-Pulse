const sinon = require('sinon');
const chai = require('chai');
const api = require('sinon');
const expect = chai.expect;


describe('Something Describing', function() {
    afterEach(function() {
      api.object.restore();
    });
    it('should do something successfully', async function() {
      sinon.stub(api, 'route').returns(apiMockObject);
      const response = await api.objectResponse();
      expect(response).to.deep.equal(apiMockObject);
    });
  });