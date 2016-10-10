import route from 'boulevard';
import url from 'url';
import rawBody from 'raw-body';
import qs from 'qs';
import {send} from 'micro';
import cookie from 'cookie';
import merge from 'lodash.merge';

const formBody = req => rawBody(req, {encoding: 'utf8'}).then(qs.parse);
const redirect = (res, location, status = 302) => {
	res.setHeader('location', location);
	return send(res, status, `Redirected to ${location}`);
};

const blogs = {};

const html = (res, t, status = 200) => {
	res.setHeader('content-type', 'text/html;charset=utf-8');
	send(res, status, t);
};

const cookies = req => cookie.parse(req.headers.cookie || '');
const setCookies = (res, cookies) => Object.keys(cookies).forEach(
	key => res.setHeader('set-cookie', cookie.serialize(key, cookies[key]))
);

const val = (value, received) => `value="${value}" ${received === value ? 'selected' : ''}`;

const blogForm = (
	id = '',
	{authornamestyle = '', contentorder = ''} = {},
	{title = '', excerpt = '', status = ''} = {}
) => `<form action="/blog/${id}" method="POST">
	<input value="${title}" name="title" placeholder="Title">
	<input value="${excerpt}" name="excerpt" placeholder="Excerpt">
	<select name="nameStyle">
		<option ${val('', authornamestyle)}>Author name style</option>
		<option ${val('full', authornamestyle)}>Full name</option>
		<option ${val('initials', authornamestyle)}>Initials</option>
	</select>
	<select name="contentOrder">
		<option ${val('', contentorder)}>Content order</option>
		<option ${val('descending', contentorder)}>New messages at top</option>
		<option ${val('ascending', contentorder)}>New messages at bottom</option>
	</select>
	<select name="status">
		<option ${val('', status)}>Blog status</option>
		<option ${val('pending', status)}>Pending</option>
		<option ${val('inprogress', status)}>In progress</option>
		<option ${val('closed', status)}>Archived</option>
	</select>
	<input type="submit" value="${id ? 'Update blog' : 'Create blog'}">
</form>`;

const blogFormMeta = (blog, body) => merge(blog, {
	config: {
		authornamestyle: body.nameStyle || 'full',
		contentorder: body.contentOrder || 'descending',
	},
	meta: {
		title: body.title,
		excerpt: body.excerpt,
		status: body.status || 'pending',
	}
});

export default route({
	'/' (req, res) {
		const {authorName = ''} = cookies(req);

		return html(res, `
		<form action="/author" method="GET">
			<input name="name" placeholder="Author name" value="${authorName}">
			<input type="submit" value="Change author name">
		</form>
		<ul>
			${Object.keys(blogs).map(key => `<li><a href="/blog/${key}">${blogs[key].meta.title}</a></li>`).join('\n')}
			<li>Create blog: ${blogForm()}</li>
		</ul>`);
	},

	'/author' (req, res) {
		const {query = {}} = url.parse(req.url, true);

		setCookies(res, {
			authorName: query.name
		});

		return redirect(res, '/');
	},

	async '/blog' (req, res) {
		switch(req.method) {
			case 'POST': {
				const id = Math.floor(Math.random() * 0xffffffffff).toString(36);
				blogs[id] = {
					catchup: [],
				};

				blogFormMeta(blogs[id], await formBody(req));

				return redirect(res, `/blog/${id}`);
			}
		}
	},

	async '/blog/:id' (req, res, params) {
		const blog = blogs[params.id];
		if(!blog) return html(res, `<a href="/">↩</a> blog ${params.id} not found`, 404);

		switch(req.method) {
			case 'POST': {
				blogFormMeta(blogs[params.id], await formBody(req));
				return redirect(res, `/blog/${params.id}`);
			}

			default: {
				const {query = {}} = url.parse(req.url, true);

				switch(query.action) {
					case 'catchup': {
						return blog.catchup;
					}

					case 'getconfig': {
						return blog.config;
					}

					case 'getmeta': {
						return blog.meta;
					}

					default: {
						return html(res, `
							<a href="/">↩</a>
							<article>
							${blogForm(params.id, blog.config, blog.meta)}

							<hr>
							<ul>
							${blog.catchup.map(event => {
								if(event.event === 'msg') return `<li><b>${event.data.authordisplayname}</b> ${event.data.textrendered}</li>`;
							}).join('\n')}
							<li>
								<form action="/blog/${params.id}/post" method="POST">
									<input name="msg" placeholder="Message"><input type="submit" value="+">
								</form>
							</li>
							</ul>
						</article>`);
					}
				}
			}
		}
	},

	async '/blog/:id/post' (req, res, params) {
		const blog = blogs[params.id];
		if(!blog) return html(res, `<a href="/">↩</a> blog ${params.id} not found`, 404);

		switch(req.method) {
			case 'POST': {
				const {authorName = 'Unknown'} = cookies(req);
				const body = await formBody(req);
				blog.catchup.push({
					event: 'msg',
					data: {
						mid: blog.catchup.length,
						textrendered: body.msg,
						emb: Math.floor(Date.now() / 1000),
						datemodified: Math.floor(Date.now() / 1000),
						authordisplayname: authorName,
						author: authorName.split(' ').map(p => p[0].toUpperCase()).join(''),
						authornamestyle: blog.config.authornamestyle,
					},
				});

				return redirect(res, `/blog/${params.id}`);
			}
		}
	}

});
